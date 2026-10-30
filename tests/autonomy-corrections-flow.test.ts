import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { handleAutonomyApi } from "../server/autonomy/api";
import {
  createRepository,
  type D1Database,
} from "../server/autonomy/repository";
import { pumpBatch } from "../server/autonomy/runner";
import { assessCorrections, responseRows } from "../src/autonomy/corrections";
import { currentDecision } from "../src/autonomy/domain";
import { fixturePdf, fixtureFiles } from "../examples/correction-fixture";

test("controlled document → authoritative register → revision → reviewed coordination export uses the real API, PDF and persisted tool loop", async () => {
  const sql = new DatabaseSync(":memory:");
  for (const f of ["0000_true_dazzler.sql", "0001_panoramic_blue_blade.sql"])
    sql.exec(readFileSync(new URL("../drizzle/" + f, import.meta.url), "utf8"));
  const DB: D1Database = {
    prepare(query) {
      let args: unknown[] = [];
      return {
        bind(...v) {
          args = v;
          return this;
        },
        async first() {
          return (sql.prepare(query).get(...(args as any[])) ?? null) as any;
        },
        async all() {
          return {
            results: sql.prepare(query).all(...(args as any[])) as any[],
          };
        },
        async run() {
          return {
            meta: {
              changes: Number(
                sql.prepare(query).run(...(args as any[])).changes,
              ),
            },
          };
        },
      };
    },
  };
  const objects = new Map<string, Uint8Array>();
  const BUCKET = {
    async put(key: string, value: string | Uint8Array) {
      objects.set(
        key,
        typeof value === "string"
          ? new TextEncoder().encode(value)
          : Uint8Array.from(value),
      );
      return { key };
    },
    async get(key: string) {
      const b = objects.get(key);
      return b ? { arrayBuffer: async () => Uint8Array.from(b).buffer } : null;
    },
  };
  const env = { DB, BUCKET, MODEL_API_KEY: "controlled-provider-test-key" },
    repo = createRepository(env),
    origin = "https://schema.test";
  const request = (path: string, data?: unknown) =>
    new Request(origin + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "oai-authenticated-user-id": "fixture-owner",
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const post = async (path: string, data: unknown) => {
    const r = await handleAutonomyApi(request(path, data), env, repo);
    assert.ok(r.ok, await r.clone().text());
    return (await r.json()) as any;
  };
  const original = globalThis.fetch;
  let projectId = "",
    modelCalls = 0,
    fileUploads = 0;
  const called = new Set<string>();
  try {
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith("/files")) {
        fileUploads++;
        const form = init?.body as FormData;
        assert.equal(form.get("purpose"), "user_data");
        assert.equal(
          new TextDecoder().decode(
            new Uint8Array(
              await (form.get("file") as File).arrayBuffer(),
            ).slice(0, 5),
          ),
          "%PDF-",
        );
        return new Response(
          JSON.stringify({ id: "file-controlled-checksheet" }),
        );
      }
      assert.equal(String(url), "https://api.meta.ai/v1/responses");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "muse-spark-1.3");
      assert.equal(body.background, true);
      modelCalls++;
      const p = (await repo.getProject(projectId))!,
        seen = new Set<string>(
          body.input
            .filter((i: any) => i.type === "function_call")
            .map((i: any) => i.name),
        );
      for (const item of body.input.filter(
        (i: any) => i.type === "function_call_output",
      ))
        assert.equal(
          JSON.parse(item.output).error,
          undefined,
          `Tool rejected a controlled proposal: ${item.output}`,
        );
      let name = "",
        args: Record<string, unknown> = {};
      if (!seen.has("inspect_project")) name = "inspect_project";
      else if (p.stage === "understanding" && !p.corrections) {
        name = "propose_review_register";
        const d = p.documents[0];
        args = {
          comments: [
            ["1", "Building", "Identify existing partitions."],
            [
              "3(a)",
              "Building",
              "Show the accessible route and door clearances.",
            ],
            ["1", "Fire", "Coordinate fire alarm documentation."],
          ].map(([number, discipline, wording], i) => ({
            id: "original_" + i,
            number,
            discipline,
            wording,
            responsible: "",
            parentId: null,
            source: { documentId: d.id, page: 1, quote: wording },
            uncertain: false,
          })),
        };
      } else if (
        p.stage === "understanding" &&
        !seen.has("propose_understanding")
      ) {
        name = "propose_understanding";
        args = {
          summary: "Declared fictional existing-office correction scope.",
          confirmedFacts: [],
          assumptions: [
            "Existing conditions and code applicability are unverified.",
          ],
          missingInformation: ["Professional plans remain required."],
        };
      } else if (
        (p.stage === "preparation" ||
          (p.stage === "handoff" &&
            p.messages.some((m) => m.text.includes("Change the Fire")) &&
            !responseRows(p).some((r) =>
              r.response.includes("Revised fire coordination"),
            ))) &&
        (!seen.has("propose_preparation") ||
          (body.input.some(
            (i: any) =>
              i.role === "user" &&
              typeof i.content === "string" &&
              i.content.includes("unaccounted reviewer comments"),
          ) &&
            responseRows(p).length < 3))
      ) {
        name = "propose_preparation";
        const includeAll =
          body.input.some(
            (i: any) =>
              i.role === "user" &&
              typeof i.content === "string" &&
              i.content.includes("unaccounted reviewer comments"),
          ) || p.messages.some((m) => m.text.includes("Change the Fire"));
        args = {
          summary: "Coordination draft retaining professional work.",
          responses: (p.messages.some((m) => m.text.includes("Change the Fire"))
            ? p.corrections!.comments.filter((c) => c.discipline === "Fire")
            : includeAll
              ? p.corrections!.comments.filter(
                  (c) => !responseRows(p).some((r) => r.itemId === c.id),
                )
              : p.corrections!.comments.slice(0, 2)
          ).map((c) => ({
            itemId: c.id,
            comment: c.wording,
            response:
              p.messages.some((m) => m.text.includes("Change the Fire")) &&
              c.discipline === "Fire"
                ? "Revised fire coordination: request professional fire alarm documentation."
                : "Professional documentation remains missing for this reviewer item.",
            evidence: [],
            dependsOnConcept: false,
          })),
          missingInformation: ["Responsible professional drawings and review."],
        };
      } else if (p.stage === "handoff" && !seen.has("propose_handoff")) {
        name = "propose_handoff";
        args = {
          summary:
            "Coordination handoff only; no city acceptance or submission readiness.",
          contents: [
            "Confirmed register",
            "Current drafts",
            "Unresolved responsibilities",
          ],
          unresolved: ["Professional plans and evidence are missing."],
          nextSteps: [
            "Obtain professional review before a separately authorized city handoff.",
          ],
        };
      }
      if (name) called.add(name);
      const output = name
        ? [
            {
              type: "function_call",
              call_id: `call_${modelCalls}`,
              name,
              arguments: JSON.stringify(args),
            },
          ]
        : [
            {
              type: "message",
              content: [
                { type: "output_text", text: "Prepared for applicant review." },
              ],
            },
          ];
      return new Response(
        JSON.stringify({
          id: "resp_" + modelCalls,
          status: "completed",
          output,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    };
    const made = await post("/api/autonomy/projects", {
      brief:
        "Fictional existing Portland office corrections; preserve current design.",
      entryPoint: "corrections",
    });
    projectId = made.project.id;
    const form = new FormData();
    form.set(
      "file",
      new File(
        [fixturePdf(fixtureFiles[0].lines)],
        "fictional-checksheet.pdf",
        { type: "application/pdf" },
      ),
    );
    const upload = await handleAutonomyApi(
      new Request(
        origin + "/api/autonomy/projects/" + projectId + "/documents",
        {
          method: "POST",
          headers: {
            Origin: origin,
            "oai-authenticated-user-id": "fixture-owner",
          },
          body: form,
        },
      ),
      env,
      repo,
    );
    assert.equal(upload.status, 200);
    assert.equal(fileUploads, 1);
    await pumpBatch(repo, env, { milliseconds: 45000, maxSteps: 12 });
    let p = (await repo.getProject(projectId))!;
    assert.equal(p.status, "needs_input");
    assert.equal(p.corrections!.comments.length, 3);
    assert.equal(p.corrections!.confirmedRevision, null);
    await post(`/api/autonomy/projects/${projectId}/confirm-register`, {
      revision: p.corrections!.revision,
    });
    await pumpBatch(repo, env, { milliseconds: 45000, maxSteps: 12 });
    p = (await repo.getProject(projectId))!;
    assert.equal(p.status, "needs_approval");
    assert.equal(p.stage, "understanding");
    await post(
      `/api/autonomy/projects/${projectId}/decisions/${currentDecision(p)!.id}`,
      {
        choice: "approve",
        feedback: "Controlled test actor confirms the fictional scope.",
      },
    );
    await pumpBatch(repo, env, { milliseconds: 45000, maxSteps: 12 });
    p = (await repo.getProject(projectId))!;
    assert.equal(p.stage, "handoff");
    assert.equal(p.status, "needs_approval");
    assert.equal(assessCorrections(p).coverage, 3);
    const oldDecision = currentDecision(p)!.id;
    await post(`/api/autonomy/projects/${projectId}/decisions/${oldDecision}`, {
      choice: "approve",
      feedback:
        "Controlled actor releases the first unresolved coordination draft.",
    });
    await post(`/api/autonomy/projects/${projectId}/message`, {
      text: "Change the Fire response to explicitly request professional fire alarm coordination and keep missing evidence explicit.",
    });
    await pumpBatch(repo, env, { milliseconds: 45000, maxSteps: 12 });
    p = (await repo.getProject(projectId))!;
    assert.equal(p.status, "needs_approval");
    assert.equal(assessCorrections(p).coverage, 3);
    assert.equal(
      p.decisions.find((d) => d.id === oldDecision)!.status,
      "stale",
    );
    assert.equal(
      p.artifacts.some((a) => a.kind === "concept"),
      false,
    );
    await post(
      `/api/autonomy/projects/${projectId}/decisions/${currentDecision(p)!.id}`,
      {
        choice: "approve",
        feedback:
          "Controlled test actor releases an unresolved coordination packet, not a submission-ready set.",
      },
    );
    p = (await repo.getProject(projectId))!;
    assert.equal(p.status, "awaiting_external");
    const exported = await handleAutonomyApi(
        request(`/api/autonomy/projects/${projectId}/packet`),
        env,
        repo,
      ),
      html = await exported.text();
    assert.equal(exported.status, 200);
    assert.ok(html.includes(`PROJECT REVISION ${p.version}`));
    for (const c of p.corrections!.comments)
      assert.ok(html.includes(c.wording));
    assert.ok(html.includes("Current review"));
    assert.equal(assessCorrections(p).submissionReady, false);
    assert.ok(objects.size > 6);
    assert.ok(
      called.has("propose_review_register") &&
        called.has("propose_preparation") &&
        called.has("propose_handoff"),
    );
  } finally {
    globalThis.fetch = original;
    sql.close();
  }
});
