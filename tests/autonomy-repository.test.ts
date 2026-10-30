import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createRepository, type D1Database, type D1Statement } from "../server/autonomy/repository";
import type { AutoProject, Preference, StageJob, ToolReceipt } from "../src/autonomy/types";

const schema = `
CREATE TABLE auto_projects (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, version INTEGER NOT NULL, state_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE auto_jobs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, status TEXT NOT NULL, next_run_at TEXT NOT NULL, lease_token TEXT, lease_until INTEGER, state_json TEXT NOT NULL);
CREATE TABLE auto_preferences (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, state_json TEXT NOT NULL);
CREATE TABLE auto_receipts (key TEXT PRIMARY KEY, job_id TEXT NOT NULL, call_id TEXT NOT NULL, state_json TEXT NOT NULL);
`;
function fixture(bucket?:unknown) {
  const sql = new DatabaseSync(":memory:"); sql.exec(schema);
  const database: D1Database = {
    prepare(query) {
      let args: unknown[] = [];
      const statement: D1Statement = {
        bind(...values) { args = values; return statement; },
        async first<T>() { return (sql.prepare(query).get(...args as (string | number | null)[]) ?? null) as T | null; },
        async all<T>() { return { results: sql.prepare(query).all(...args as (string | number | null)[]) as T[] }; },
        async run() { return { meta: { changes: Number(sql.prepare(query).run(...args as (string | number | null)[]).changes) } }; },
      };
      return statement;
    },
  };
  return { sql, repo: createRepository({ DB: database, BUCKET:bucket }) };
}
function project(id = "p1", ownerId = "owner-a"): AutoProject {
  const now = new Date().toISOString();
  return { schemaVersion: 1, id, ownerId, version: 1, title: "Office fit-out", brief: "A fictional office", stage: "understanding", status: "running", createdAt: now, updatedAt: now, documents: [], artifacts: [], decisions: [], tasks: [], messages: [], events: [], mail: [], questions: [], recipient: null, inboxStatus: "not_connected" };
}
function job(id = "j1"): StageJob {
  const now = new Date(Date.now() - 1_000).toISOString();
  return { id, projectId: "p1", stage: "understanding", status: "queued", projectVersion: 1, modelRequests: 0, toolExecutions: 0, retries: 0, startedAt: now, updatedAt: now, nextRunAt: now, history: [], completedCallIds: [] };
}
function preference(id = "pref1", ownerId = "owner-a"): Preference {
  const now = new Date().toISOString();
  return { id, ownerId, scope: "reusable", projectId: null, category: "language", text: "Concise explanations", status: "active", originDecisionId: "d1", createdAt: now, updatedAt: now };
}

test("missing database fails explicitly without creating request-time tables", () => {
  assert.throws(() => createRepository({}), /storage is unavailable/);
});
test("project writes use owner-bound compare-and-swap and reject stale versions", async () => {
  const { repo, sql } = fixture();
  const original = project(); await repo.createProject(original);
  await repo.createProject(project("p2", "owner-b"));
  assert.equal((await repo.listProjects("owner-a")).length, 1);
  const next = { ...original, version: 2, title: "Revised brief" };
  assert.equal(await repo.saveProject(next, 1), true);
  assert.equal(await repo.saveProject({ ...next, title: "Stale writer" }, 1), false);
  assert.equal(await repo.saveProject({ ...next, version: 3, ownerId: "owner-b" }, 2), false);
  assert.equal(await repo.saveProject({ ...next, version: 10 }, 2), false);
  assert.equal((await repo.getProject("p1"))?.title, "Revised brief");
  assert.equal((await repo.getProject("missing")), null);
  sql.close();
});
test("racing pumps claim one job and stale lease saves cannot overwrite it", async () => {
  const { repo, sql } = fixture(); const original = job(); await repo.saveJob(original);
  const now = Date.now();
  const claims = await Promise.all([repo.claimJob("j1", "pump-a", now, 30_000), repo.claimJob("j1", "pump-b", now, 30_000)]);
  assert.equal(claims.filter(Boolean).length, 1);
  const claimed = claims.find(Boolean)!;
  assert.equal((await repo.runnableJobs(10)).length, 0);
  assert.equal(await repo.saveJob({ ...original, status: "cancelled" }), false);
  assert.equal(await repo.saveJob({ ...claimed, status: "done" }, "wrong-token"), false);
  assert.equal(await repo.saveJob({ ...claimed, status: "waiting_provider", responseId: "resp-1" }, claimed.leaseToken), true);
  const saved = await repo.getJob("j1");
  assert.equal(saved?.responseId, "resp-1"); assert.equal(saved?.leaseToken, undefined);
  assert.equal((await repo.runnableJobs(10)).length, 1);
  sql.close();
});
test("expired leases are recoverable but expired workers cannot write after another claim", async () => {
  const { repo, sql } = fixture(); await repo.saveJob({ ...job(), nextRunAt: new Date(Date.now() - 20_000).toISOString() });
  const first = await repo.claimJob("j1", "expired", Date.now() - 10_000, 1_000);
  assert.ok(first);
  assert.equal(await repo.saveJob({ ...first, status: "done" }, "expired"), false);
  const fresh = await repo.claimJob("j1", "fresh", Date.now(), 10_000);
  assert.equal(fresh?.leaseToken, "fresh");
  assert.equal(await repo.saveJob({ ...first, status: "done" }, "expired"), false);
  assert.equal(await repo.saveJob({ ...fresh!, status: "done" }, "fresh"), true);
  assert.equal(await repo.saveJob(job()), false);
  assert.equal((await repo.getJob("j1"))?.status, "done");
  sql.close();
});
test("future and terminal jobs are not runnable and cancellation cannot be resurrected", async () => {
  const { repo, sql } = fixture();
  await repo.saveJob({ ...job("future"), nextRunAt: new Date(Date.now() + 60_000).toISOString() });
  assert.equal(await repo.claimJob("future", "lease", Date.now(), 1_000), null);
  await repo.saveJob(job("cancel"));
  assert.equal(await repo.saveJob({ ...job("cancel"), status: "cancelled" }), true);
  assert.equal(await repo.saveJob(job("cancel")), false);
  assert.equal((await repo.runnableJobs(10)).length, 0);
  await assert.rejects(() => repo.claimJob("future", "lease", Date.now(), 0), /Invalid job lease/);
  sql.close();
});
test("preference updates and deletion cannot cross owner boundaries", async () => {
  const { repo, sql } = fixture(); await repo.putPreference(preference());
  await repo.putPreference({ ...preference("pref1", "owner-b"), text: "Wrong owner" });
  assert.equal((await repo.getPreferences("owner-b")).length, 0);
  assert.equal((await repo.getPreferences("owner-a"))[0].text, "Concise explanations");
  await repo.deletePreference("owner-b", "pref1");
  assert.equal((await repo.getPreferences("owner-a")).length, 1);
  await repo.putPreference({ ...preference(), text: "Detailed plans", status: "disabled" });
  assert.equal((await repo.getPreferences("owner-a"))[0].status, "disabled");
  await repo.deletePreference("owner-a", "pref1");
  assert.deepEqual(await repo.getPreferences("owner-a"), []);
  sql.close();
});
test("tool receipts are inserted once and duplicate delivery preserves the first result", async () => {
  const { repo, sql } = fixture();
  const receipt: ToolReceipt = { key: "j1:call1", jobId: "j1", callId: "call1", result: { artifactId: "a1" }, createdAt: new Date().toISOString() };
  const results = await Promise.all([repo.recordReceiptIfAbsent(receipt), repo.recordReceiptIfAbsent({ ...receipt, result: { artifactId: "wrong" } })]);
  assert.deepEqual(results, [true, false]);
  assert.deepEqual((await repo.getReceipt(receipt.key))?.result, { artifactId: "a1" });
  assert.equal(await repo.getReceipt("missing"), null);
  sql.close();
});

test("job checkpoints retain the lease until a later fenced final save", async () => {
  const { repo, sql } = fixture(); await repo.saveJob(job());
  const claimed = await repo.claimJob("j1", "pump", Date.now(), 30_000);
  const checkpoint = { ...claimed!, modelRequests: 1, responseId: "resp-persisted", history: [{ type: "function_call", call_id: "call-1" }] };
  assert.equal(await repo.checkpointJob(checkpoint, "pump"), true);
  const saved = await repo.getJob("j1");
  assert.equal(saved?.modelRequests, 1); assert.equal(saved?.responseId, "resp-persisted");
  assert.equal(saved?.leaseToken, "pump"); assert.equal(saved?.leaseUntil, claimed?.leaseUntil);
  assert.equal(await repo.claimJob("j1", "other", Date.now(), 30_000), null);
  assert.equal(await repo.saveJob({ ...saved!, status: "waiting_provider" }, "pump"), true);
  assert.equal((await repo.getJob("j1"))?.leaseToken, undefined);
  sql.close();
});
test("expired and replaced leases cannot checkpoint or move a job to another project", async () => {
  const { repo, sql } = fixture(); await repo.saveJob({ ...job(), nextRunAt: new Date(Date.now() - 20_000).toISOString() });
  const expired = await repo.claimJob("j1", "expired", Date.now() - 10_000, 1_000);
  assert.equal(await repo.checkpointJob({ ...expired!, modelRequests: 9 }, "expired"), false);
  const fresh = await repo.claimJob("j1", "fresh", Date.now(), 30_000);
  assert.equal(await repo.checkpointJob({ ...expired!, modelRequests: 9 }, "expired"), false);
  assert.equal(await repo.checkpointJob({ ...fresh!, projectId: "another-project" }, "fresh"), false);
  assert.equal(await repo.saveJob({ ...fresh!, projectId: "another-project" }, "fresh"), false);
  assert.equal((await repo.getJob("j1"))?.modelRequests, 0);
  assert.equal(await repo.checkpointJob({ ...fresh!, status: "done" }, "fresh"), true);
  assert.equal(await repo.checkpointJob({ ...fresh!, status: "queued" }, "fresh"), false);
  sql.close();
});
test("storage limits count UTF8 bytes and reject oversized state before modifying rows", async () => {
  const { repo, sql } = fixture(); const original = project(); await repo.createProject(original);
  await assert.rejects(() => repo.createProject({ ...project("oversized"), brief: "文".repeat(260_000) }), /storage limit/);
  assert.equal(await repo.getProject("oversized"), null);
  await assert.rejects(() => repo.saveProject({ ...original, version: 2, brief: "x".repeat(750_000) }, 1), /storage limit/);
  assert.equal((await repo.getProject("p1"))?.version, 1);
  const oversized = { ...job(), history: ["文".repeat(260_000)] };
  await assert.rejects(() => repo.saveJob(oversized), /storage limit/);
  await repo.saveJob(job()); const claimed = await repo.claimJob("j1", "pump", Date.now(), 30_000);
  await assert.rejects(() => repo.checkpointJob({ ...claimed!, history: oversized.history }, "pump"), /storage limit/);
  assert.equal((await repo.getJob("j1"))?.leaseToken, "pump");
  const receipt: ToolReceipt = { key: "oversized", jobId: "j1", callId: "call1", result: "文".repeat(260_000), createdAt: new Date().toISOString() };
  await assert.rejects(() => repo.recordReceiptIfAbsent(receipt), /storage limit/);
  assert.equal(await repo.getReceipt("oversized"), null);
  sql.close();
});

test("generated artifact snapshots are immutable and a failed snapshot cannot commit project progress",async()=>{
 const objects=new Map<string,string>();let fail=false;const {repo}=fixture({async put(key:string,value:string){if(fail)throw new Error('R2 unavailable');objects.set(key,value);return {key};}});
 const p=project();await repo.createProject(p);const next={...p,version:2,artifacts:[{id:'understanding',kind:'understanding' as const,revision:1,title:'Understanding',data:{summary:'Fictional facts'},dependsOn:{},sources:[],createdAt:p.createdAt}]};assert.equal(await repo.saveProject(next,p.version),true);assert.equal(objects.size,2);assert.ok([...objects.keys()].every(key=>key.startsWith('projects/owner-a/p1/versions/')));assert.ok([...objects.values()].some(value=>JSON.parse(value).version===1));assert.ok([...objects.values()].some(value=>JSON.parse(value).artifacts[0]?.revision===1));
 fail=true;await assert.rejects(repo.saveProject({...next,version:3,title:'Not committed'},2),/R2 unavailable/);assert.equal((await repo.getProject(p.id))?.version,2);assert.equal(objects.size,2);
});
