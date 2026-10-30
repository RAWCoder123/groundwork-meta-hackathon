import type { AutoEnvironment, AutoProject, Preference, Repository, StageJob, ToolReceipt } from "../../src/autonomy/types";

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}
export interface D1Database { prepare(sql: string): D1Statement }
type StateRow = { state_json: string };
type JobRow = StateRow & { lease_token: string | null; lease_until: number | null };

function changed(result: { meta?: { changes?: number } }): boolean {
  return (result.meta?.changes ?? 0) > 0;
}
function decode<T>(row: StateRow | null): T | null {
  if (!row) return null;
  try { return JSON.parse(row.state_json) as T; }
  catch { throw new Error("Stored project data could not be read. No record was changed."); }
}
const MAX_STATE_BYTES = 750_000;
function serializeState(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > MAX_STATE_BYTES) {
    throw new Error("Project state exceeds the supported storage limit. No record was changed; reduce document excerpts or agent history before continuing.");
  }
  return serialized;
}
function jobState(job: StageJob): string {
  const { leaseToken: _leaseToken, leaseUntil: _leaseUntil, ...state } = job;
  return serializeState(state);
}
function decodeJob(row: JobRow | null): StageJob | null {
  const state = decode<StageJob>(row);
  if (!state || !row) return null;
  delete state.leaseToken; delete state.leaseUntil;
  if (row.lease_token) state.leaseToken = row.lease_token;
  if (row.lease_until !== null) state.leaseUntil = row.lease_until;
  return state;
}

/** Private immutable recovery snapshots include each generated artifact revision.
 * The D1 compare-and-swap remains authoritative; a losing write may leave an
 * unreferenced private snapshot, never an approved or current project record. */
async function archiveProject(env:AutoEnvironment,project:AutoProject,state:string){
 const bucket=env.BUCKET as {put(key:string,value:string,options:unknown):Promise<unknown>}|undefined;
 if(!bucket)return; // Database-only unit harnesses; production declares BUCKET.
 if(typeof bucket.put!=='function')throw new Error('Versioned artifact storage is unavailable. No project change was committed.');
 const bytes=new TextEncoder().encode(state);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 const key=`projects/${encodeURIComponent(project.ownerId)}/${encodeURIComponent(project.id)}/versions/${project.version}-${digest}.json`;
 if(!await bucket.put(key,state,{httpMetadata:{contentType:'application/json'},customMetadata:{projectId:project.id,revision:String(project.version)}}))throw new Error('The versioned artifact snapshot was not confirmed. No project change was committed.');
}

/** Server-owned storage only. Identity authorization belongs to each API/tool caller. */
export function createRepository(env: AutoEnvironment): Repository & { checkpointJob(job: StageJob, leaseToken: string): Promise<boolean> } {
  const db = env.DB as D1Database | undefined;
  if (!db || typeof db.prepare !== "function") {
    throw new Error("Project storage is unavailable. Configure the hosted DB binding and apply migrations before running the agent.");
  }
  return {
    async createProject(project) {
      if (!Number.isSafeInteger(project.version) || project.version < 1) throw new Error("Invalid project version.");
      const state=serializeState(project);await archiveProject(env,project,state);
      await db.prepare("INSERT INTO auto_projects (id, owner_id, version, state_json, updated_at) VALUES (?, ?, ?, ?, ?)")
        .bind(project.id, project.ownerId, project.version, state, project.updatedAt).run();
    },
    async getProject(id) {
      return decode<AutoProject>(await db.prepare("SELECT state_json FROM auto_projects WHERE id = ?").bind(id).first<StateRow>());
    },
    async listProjects(ownerId) {
      const rows = await db.prepare("SELECT state_json FROM auto_projects WHERE owner_id = ? ORDER BY updated_at DESC, id ASC LIMIT 100")
        .bind(ownerId).all<StateRow>();
      return rows.results.map(row => decode<AutoProject>(row)!);
    },
    async saveProject(project, expectedVersion) {
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || project.version !== expectedVersion + 1) return false;
      const current=decode<AutoProject>(await db.prepare("SELECT state_json FROM auto_projects WHERE id = ?").bind(project.id).first<StateRow>());
      if(!current||current.ownerId!==project.ownerId||current.version!==expectedVersion)return false;
      const state=serializeState(project);await archiveProject(env,project,state);
      return changed(await db.prepare("UPDATE auto_projects SET version = ?, state_json = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND version = ?")
        .bind(project.version, state, project.updatedAt, project.id, project.ownerId, expectedVersion).run());
    },
    async getJob(id) {
      return decodeJob(await db.prepare("SELECT state_json, lease_token, lease_until FROM auto_jobs WHERE id = ?").bind(id).first<JobRow>());
    },
    async saveJob(job, leaseToken) {
      const now = Date.now();
      if (leaseToken) {
        return changed(await db.prepare("UPDATE auto_jobs SET project_id = ?, status = ?, next_run_at = ?, state_json = ?, lease_token = NULL, lease_until = NULL WHERE id = ? AND project_id = ? AND lease_token = ? AND lease_until > ? AND status NOT IN ('done', 'cancelled')")
          .bind(job.projectId, job.status, job.nextRunAt, jobState(job), job.id, job.projectId, leaseToken, now).run());
      }
      // A normal caller may enqueue or cancel an unclaimed job, but never steal a live lease.
      // Finished/cancelled jobs cannot be resurrected by a stale non-leased save.
      return changed(await db.prepare("INSERT INTO auto_jobs (id, project_id, status, next_run_at, lease_token, lease_until, state_json) VALUES (?, ?, ?, ?, NULL, NULL, ?) ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, status = excluded.status, next_run_at = excluded.next_run_at, state_json = excluded.state_json, lease_token = NULL, lease_until = NULL WHERE (auto_jobs.lease_token IS NULL OR auto_jobs.lease_until <= ?) AND auto_jobs.status NOT IN ('done', 'cancelled') AND auto_jobs.project_id = excluded.project_id")
        .bind(job.id, job.projectId, job.status, job.nextRunAt, jobState(job), now).run());
    },
    async checkpointJob(job, leaseToken) {
      if (!leaseToken) return false;
      // Persist an intermediate provider/tool boundary without releasing ownership.
      return changed(await db.prepare("UPDATE auto_jobs SET project_id = ?, status = ?, next_run_at = ?, state_json = ? WHERE id = ? AND project_id = ? AND lease_token = ? AND lease_until > ? AND status NOT IN ('done', 'cancelled')")
        .bind(job.projectId, job.status, job.nextRunAt, jobState(job), job.id, job.projectId, leaseToken, Date.now()).run());
    },
    async claimJob(jobId, leaseToken, now, leaseMs) {
      if (!leaseToken || !Number.isFinite(now) || !Number.isFinite(leaseMs) || leaseMs <= 0 || leaseMs > 300_000) throw new Error("Invalid job lease.");
      // UPDATE RETURNING keeps acquisition and returned state in one atomic statement.
      const row = await db.prepare("UPDATE auto_jobs SET lease_token = ?, lease_until = ? WHERE id = ? AND status IN ('queued', 'waiting_provider', 'running') AND next_run_at <= ? AND (lease_token IS NULL OR lease_until <= ?) RETURNING state_json, lease_token, lease_until")
        .bind(leaseToken, now + leaseMs, jobId, new Date(now).toISOString(), now).first<JobRow>();
      return decodeJob(row);
    },
    async runnableJobs(limit) {
      const count = Math.max(1, Math.min(100, Math.trunc(Number.isFinite(limit) ? limit : 1)));
      const now = Date.now();
      const rows = await db.prepare("SELECT state_json, lease_token, lease_until FROM auto_jobs WHERE status IN ('queued', 'waiting_provider', 'running') AND next_run_at <= ? AND (lease_token IS NULL OR lease_until <= ?) ORDER BY next_run_at ASC, id ASC LIMIT ?")
        .bind(new Date(now).toISOString(), now, count).all<JobRow>();
      return rows.results.map(row => decodeJob(row)!);
    },
    async getPreferences(ownerId) {
      const rows = await db.prepare("SELECT state_json FROM auto_preferences WHERE owner_id = ? ORDER BY id ASC LIMIT 200").bind(ownerId).all<StateRow>();
      return rows.results.map(row => decode<Preference>(row)!);
    },
    async putPreference(preference) {
      await db.prepare("INSERT INTO auto_preferences (id, owner_id, state_json) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json WHERE auto_preferences.owner_id = excluded.owner_id")
        .bind(preference.id, preference.ownerId, serializeState(preference)).run();
    },
    async deletePreference(ownerId, id) {
      await db.prepare("DELETE FROM auto_preferences WHERE owner_id = ? AND id = ?").bind(ownerId, id).run();
    },
    async getReceipt(key) {
      return decode<ToolReceipt>(await db.prepare("SELECT state_json FROM auto_receipts WHERE key = ?").bind(key).first<StateRow>());
    },
    async recordReceiptIfAbsent(receipt) {
      return changed(await db.prepare("INSERT INTO auto_receipts (key, job_id, call_id, state_json) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO NOTHING")
        .bind(receipt.key, receipt.jobId, receipt.callId, serializeState(receipt)).run());
    },
  };
}
