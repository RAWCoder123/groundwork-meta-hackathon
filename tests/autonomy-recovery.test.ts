import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  createRepository,
  type D1Database,
  type D1Statement,
} from "../server/autonomy/repository";
import { createAutoProject, createStageJob } from "../src/autonomy/domain";
import { recoverExecution } from "../server/autonomy/recovery";
import { advanceJob, pumpBatch } from "../server/autonomy/runner";
function setup() {
  const sql = new DatabaseSync(":memory:");
  for (const file of ["0000_true_dazzler.sql", "0001_panoramic_blue_blade.sql"])
    sql.exec(
      readFileSync(new URL("../drizzle/" + file, import.meta.url), "utf8"),
    );
  const DB: D1Database = {
    prepare(query) {
      let values: unknown[] = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async first() {
          return (sql.prepare(query).get(...(values as any[])) ?? null) as any;
        },
        async all() {
          return {
            results: sql.prepare(query).all(...(values as any[])) as any[],
          };
        },
        async run() {
          return {
            meta: {
              changes: Number(
                sql.prepare(query).run(...(values as any[])).changes,
              ),
            },
          };
        },
      };
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const result = [];
        for (const statement of statements) result.push(await statement.run());
        sql.exec("COMMIT");
        return result;
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sql, env: { DB }, repo: createRepository({ DB }) };
}
async function stopped(kind: "configuration" | "limit" = "configuration") {
  const f = setup();
  const p = createAutoProject("owner", "Fictional recovery case");
  p.status = "blocked";
  await f.repo.createProject(p);
  const j = createStageJob({ ...p, status: "running" });
  j.status = "blocked";
  j.failureKind = kind;
  j.modelRequests = 3;
  j.toolExecutions = 5;
  j.responseId = "resp_saved";
  j.history = [{ role: "user", content: "Retain this request" }];
  await f.repo.saveJob(j);
  return { ...f, p, j };
}
test("saved-run recovery preserves provider state, counters and elapsed budget", async () => {
  const { repo, env, p, j } = await stopped();
  const recovered = await recoverExecution(env, p, "retry");
  const saved = (await repo.getJob(j.id))!;
  assert.equal(recovered.status, "running");
  assert.equal(saved.responseId, j.responseId);
  assert.equal(saved.modelRequests, 3);
  assert.equal(saved.toolExecutions, 5);
  assert.equal(saved.startedAt, j.startedAt);
  assert.deepEqual(saved.history, j.history);
  assert.equal(saved.projectVersion, recovered.version);
});
test("an exhausted run requires explicit new attempt; duplicate recovery cannot enqueue twice", async () => {
  const { repo, env, p, j, sql } = await stopped("limit");
  await assert.rejects(recoverExecution(env, p, "retry"), /exhausted/);
  const resumed = await recoverExecution(env, p, "new_attempt");
  assert.equal((await repo.getJob(j.id))!.status, "cancelled");
  const due = await repo.runnableJobs(10);
  assert.equal(due.length, 1);
  assert.equal(due[0].modelRequests, 0);
  assert.equal(due[0].toolExecutions, 0);
  assert.notEqual(due[0].id, j.id);
  await assert.rejects(recoverExecution(env, p, "new_attempt"));
  assert.equal(
    sql
      .prepare("SELECT count(*) AS n FROM auto_jobs WHERE status='queued'")
      .get()?.n,
    1,
  );
  assert.ok(resumed.events.some((e) => e.type === "new_attempt_authorized"));
});
test("bounded batch continues multiple saved tool exchanges in one invocation", async () => {
  const { repo, env } = setup();
  const p = createAutoProject("owner", "Fictional batch case");
  await repo.createProject(p);
  await repo.saveJob(createStageJob(p));
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return new Response(
        JSON.stringify({
          id: "resp_" + calls,
          status: "completed",
          output:
            calls === 1
              ? [
                  {
                    type: "function_call",
                    name: "inspect_project",
                    call_id: "inspect",
                    arguments: "{}",
                  },
                ]
              : calls === 2
                ? [
                    {
                      type: "function_call",
                      name: "propose_understanding",
                      call_id: "understanding",
                      arguments: JSON.stringify({
                        summary: "Declared fictional scope",
                        confirmedFacts: [],
                        assumptions: ["No permit eligibility is established"],
                        missingInformation: [],
                      }),
                    },
                  ]
                : [
                    {
                      type: "message",
                      content: [
                        { type: "output_text", text: "Ready for review" },
                      ],
                    },
                  ],
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    };
    const outcomes = await pumpBatch(
      repo,
      { ...env, MODEL_API_KEY: "fake-test-key" },
      { maxSteps: 8, milliseconds: 25000 },
    );
    assert.equal(outcomes.length, 3);
    assert.equal((await repo.getProject(p.id))!.status, "needs_approval");
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = original;
  }
});
test("a concurrent context change cannot rebase the old provider job onto new project content", async () => {
  const { repo, env, p, j } = await stopped();
  const original = env.DB.batch!;
  env.DB.batch = async (statements) => {
    const changed = structuredClone(p);
    changed.version++;
    changed.status = "running";
    changed.brief = "Different authorized context";
    changed.events.push({
      id: "different-change",
      type: "feedback",
      detail: "Changed context",
      createdAt: new Date().toISOString(),
    });
    await repo.saveProject(changed, p.version);
    await repo.saveJob(createStageJob(changed));
    return original.call(env.DB, statements);
  };
  await assert.rejects(
    recoverExecution(env, p, "retry"),
    /changed during recovery/,
  );
  assert.equal((await repo.getJob(j.id))!.status, "blocked");
  assert.equal((await repo.getJob(j.id))!.projectVersion, p.version);
  assert.equal((await repo.runnableJobs(10)).length, 1);
});
