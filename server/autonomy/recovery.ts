import { createStageJob, validateProject } from "../../src/autonomy/domain";
import type {
  AutoEnvironment,
  AutoProject,
  StageJob,
} from "../../src/autonomy/types";
import { archiveProject, type D1Database } from "./repository";
export async function recoverExecution(
  env: AutoEnvironment,
  p: AutoProject,
  mode: "retry" | "new_attempt",
) {
  if (p.status !== "blocked")
    throw new Error(
      "Only blocked work can be recovered. Paused work uses Resume.",
    );
  const db = env.DB as D1Database;
  const record = await db
    .prepare(
      "SELECT state_json,lease_until FROM auto_jobs WHERE project_id=? AND status='blocked' ORDER BY json_extract(state_json,'$.updatedAt') DESC LIMIT 1",
    )
    .bind(p.id)
    .first<{ state_json: string; lease_until: number | null }>();
  if (!record || (record.lease_until && record.lease_until > Date.now()))
    throw new Error("No recoverable stopped run is available yet.");
  const old = JSON.parse(record.state_json) as StageJob;
  if (old.projectVersion !== p.version)
    throw new Error(
      "The project changed after this run stopped. Refresh its current state.",
    );
  if (
    mode === "retry" &&
    (old.failureKind === "limit" ||
      old.retries >= 2 ||
      Date.now() -
        Date.parse(
          old.executionStartedAt ??
            (old.modelRequests || old.toolExecutions
              ? old.startedAt
              : new Date().toISOString()),
        ) >
        3600000 ||
      old.modelRequests >= 12 ||
      old.toolExecutions >= 24)
  )
    throw new Error(
      "This bounded attempt is exhausted. Review progress and explicitly start a new attempt.",
    );
  const next = structuredClone(p);
  next.version++;
  next.updatedAt = new Date().toISOString();
  next.status = "running";
  delete next.blockedReason;
  delete next.pauseState;
  next.events.push({
    id: crypto.randomUUID(),
    type: mode === "retry" ? "run_recovered" : "new_attempt_authorized",
    detail:
      mode === "retry"
        ? "User retried the saved run without resetting its budgets."
        : "User explicitly authorized a new bounded attempt after reviewing stopped progress.",
    createdAt: next.updatedAt,
  });
  validateProject(next);
  const recoveryEventId = next.events.at(-1)!.id;
  const job =
    mode === "new_attempt"
      ? createStageJob(next)
      : {
          ...old,
          status: old.responseId
            ? ("waiting_provider" as const)
            : ("queued" as const),
          projectVersion: next.version,
          nextRunAt: next.updatedAt,
          updatedAt: next.updatedAt,
        };
  if (mode === "retry" && old.failureKind === "transient") job.retries++;
  delete job.lastError;
  delete job.failureKind;
  delete job.leaseToken;
  delete job.leaseUntil;
  for (const state of [next, job])
    if (new TextEncoder().encode(JSON.stringify(state)).length > 750000)
      throw new Error(
        "Saved progress exceeds the supported size. Narrow the project before recovery.",
      );
  if (!db.batch)
    throw new Error(
      "Atomic recovery is unavailable in this environment. No run was restarted.",
    );
  await archiveProject(env, next, JSON.stringify(next));
  const projectUpdate = db
    .prepare(
      "UPDATE auto_projects SET version=?,state_json=?,updated_at=? WHERE id=? AND owner_id=? AND version=? AND EXISTS(SELECT 1 FROM auto_jobs WHERE id=? AND status='blocked' AND (lease_until IS NULL OR lease_until<=?))",
    )
    .bind(
      next.version,
      JSON.stringify(next),
      next.updatedAt,
      next.id,
      next.ownerId,
      p.version,
      old.id,
      Date.now(),
    );
  const changes = [projectUpdate];
  if (mode === "retry")
    changes.push(
      db
        .prepare(
          "UPDATE auto_jobs SET status=?,next_run_at=?,state_json=?,lease_token=NULL,lease_until=NULL WHERE id=? AND status='blocked' AND EXISTS(SELECT 1 FROM auto_projects WHERE id=? AND version=? AND json_extract(state_json,'$.events[#-1].id')=?)",
        )
        .bind(
          job.status,
          job.nextRunAt,
          JSON.stringify(job),
          old.id,
          p.id,
          next.version,
          recoveryEventId,
        ),
    );
  else {
    changes.push(
      db
        .prepare(
          "UPDATE auto_jobs SET status='cancelled',state_json=? WHERE id=? AND status='blocked' AND EXISTS(SELECT 1 FROM auto_projects WHERE id=? AND version=? AND json_extract(state_json,'$.events[#-1].id')=?)",
        )
        .bind(
          JSON.stringify({ ...old, status: "cancelled" }),
          old.id,
          p.id,
          next.version,
          recoveryEventId,
        ),
    );
    changes.push(
      db
        .prepare(
          "INSERT INTO auto_jobs(id,project_id,status,next_run_at,state_json) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM auto_projects WHERE id=? AND version=? AND json_extract(state_json,'$.events[#-1].id')=?) AND EXISTS(SELECT 1 FROM auto_jobs WHERE id=? AND status='cancelled') ON CONFLICT(id) DO NOTHING",
        )
        .bind(
          job.id,
          job.projectId,
          job.status,
          job.nextRunAt,
          JSON.stringify(job),
          p.id,
          next.version,
          recoveryEventId,
          old.id,
        ),
    );
  }
  const results = await db.batch(changes);
  if (results.some((r) => !r.meta?.changes))
    throw new Error(
      "The stopped run changed during recovery. Refresh the project.",
    );
  return next;
}
