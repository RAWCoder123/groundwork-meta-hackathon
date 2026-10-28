import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { handleApi } from "../server/api";
import { makeProject } from "../src/domain/fixtures";

const originalFetch = globalThis.fetch;
const SECRET = "meta-test-secret-never-display";
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function request(
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Request {
  return new Request(`https://groundwork.example${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://groundwork.example",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}
function agentRequest(
  message = "Move the ADU west and check it.",
  mode = "meta",
): Request {
  return request(
    "/api/agent",
    { project: makeProject(), message, mode },
    { "x-meta-api-key": SECRET },
  );
}
function provider(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
function functionCall(name: string, args: unknown = {}, id = name) {
  return {
    type: "function_call",
    name,
    arguments: JSON.stringify(args),
    call_id: id,
  };
}
function finished(
  message = "This proposed location passes the selected demonstration checks.",
  selectedPreviewId: string | null = null,
) {
  return {
    id: "resp_final",
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({ message, selectedPreviewId }),
          },
        ],
      },
    ],
  };
}

test("status reports server key configuration without returning the key", async () => {
  const res = await handleApi(
    new Request("https://groundwork.example/api/meta/status"),
    { MODEL_API_KEY: SECRET },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    configured: true,
    model: "muse-spark-1.3",
  });
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("missing live key fails honestly without calling Meta", async () => {
  globalThis.fetch = async () => {
    throw new Error("Should not call provider");
  };
  const res = await handleApi(
    request("/api/agent", {
      project: makeProject(),
      message: "Repair the design",
      mode: "meta",
    }),
  );
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "meta_not_connected");
});

test("cross-origin requests are rejected before any paid call", async () => {
  globalThis.fetch = async () => {
    throw new Error("Should not call provider");
  };
  const res = await handleApi(
    request(
      "/api/agent",
      { project: makeProject(), message: "Repair", mode: "meta" },
      { origin: "https://evil.example", "x-meta-api-key": SECRET },
    ),
  );
  assert.equal(res.status, 403);
});

test("malformed and overlarge JSON requests are rejected", async () => {
  const invalid = new Request("https://groundwork.example/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal((await handleApi(invalid)).status, 400);
  const tooLarge = request("/api/agent", { padding: "a".repeat(33_000) });
  assert.equal((await handleApi(tooLarge)).status, 413);
});

test("invalid nested project data never reaches the provider", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return provider({});
  };
  const project = makeProject();
  project.site.house.width = project.site.width + 1;
  const res = await handleApi(
    request(
      "/api/agent",
      { project, message: "Check", mode: "meta" },
      { "x-meta-api-key": SECRET },
    ),
  );
  assert.equal(res.status, 400);
  assert.equal(called, false);
});

test("unsupported site geometry cannot expand the bounded repair search", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return provider({});
  };
  const project = makeProject();
  project.site.width = 1000;
  project.site.depth = 1000;
  const res = await handleApi(
    request(
      "/api/agent",
      { project, message: "Repair", mode: "meta" },
      { "x-meta-api-key": SECRET },
    ),
  );
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "unsupported_site");
  assert.equal(called, false);
});

test("callers cannot mark the fixture property review as completed", async () => {
  const project = makeProject();
  project.site.overlaysReviewed = true;
  const res = await handleApi(
    request("/api/agent", { project, message: "Check", mode: "local" }),
  );
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "unsupported_site");
});

test("connect verifies the exact model through the official API", async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "https://api.meta.ai/v1/models");
    assert.equal(init?.redirect, "manual", "Workers-compatible, no credential forwarding");
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      `Bearer ${SECRET}`,
    );
    return provider({ data: [{ id: "muse-spark-1.3" }] });
  };
  const res = await handleApi(
    request("/api/meta/connect", {}, { "x-meta-api-key": SECRET }),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    connected: true,
    model: "muse-spark-1.3",
  });
});

test("connect refuses a key without the required model", async () => {
  globalThis.fetch = async () =>
    provider({ data: [{ id: "unrelated-model" }] });
  const res = await handleApi(
    request("/api/meta/connect", {}, { "x-meta-api-key": SECRET }),
  );
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "meta_model_unavailable");
});

test("Meta executes a real tool loop and returns only a checked unapplied patch", async () => {
  const requests: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "https://api.meta.ai/v1/responses");
    assert.equal(init?.redirect, "manual");
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    if (requests.length === 1)
      return provider({
        id: "resp_1",
        status: "completed",
        output: [
          functionCall("inspect_project"),
          functionCall("check_geometry"),
        ],
      });
    if (requests.length === 2) {
      assert.equal(body.previous_response_id, "resp_1");
      assert.equal(body.input[0].type, "function_call_output");
      assert.match(body.input[0].output, /demonstration/i);
      return provider({
        id: "resp_2",
        status: "completed",
        output: [
          functionCall("preview_design_patch", { patch: { x: 12 } }, "patch"),
        ],
      });
    }
    const previewOutput = JSON.parse(body.input[0].output);
    assert.equal(previewOutput.applied, false);
    assert.equal(previewOutput.selectable, true);
    return provider({
      ...finished(undefined, previewOutput.previewId),
      usage: { input_tokens: 100, output_tokens: 50, unexpected: SECRET },
    });
  };
  const project = makeProject();
  const before = JSON.stringify(project);
  const res = await handleApi(
    request(
      "/api/agent",
      { project, message: "Move to x 12.", mode: "meta" },
      { "x-meta-api-key": SECRET },
    ),
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.mode, "meta");
  assert.equal(data.model, "muse-spark-1.3");
  assert.deepEqual(data.patch, { x: 12 });
  assert.deepEqual(
    data.steps.map((s: { tool: string }) => s.tool),
    ["inspect_project", "check_geometry", "preview_design_patch"],
  );
  assert.equal(JSON.stringify(project), before);
  assert.equal(JSON.stringify(data).includes(SECRET), false);
  assert.equal(requests.length, 3);
});

test("an invalid patch cannot be selected even when the model requests it", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1)
      return provider({
        id: "resp_1",
        output: [
          functionCall("inspect_project"),
          functionCall("check_geometry"),
          functionCall("preview_design_patch", { patch: { width: -50 } }),
        ],
      });
    return provider(finished("I changed the design.", "preview_3_1"));
  };
  const res = await handleApi(agentRequest());
  assert.equal(res.status, 502);
  assert.equal((await res.json()).code, "meta_unverified_patch");
});

test("unsupported tools are rejected and never executed", async () => {
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    if (calls === 1)
      return provider({
        id: "resp_1",
        output: [
          functionCall("inspect_project"),
          functionCall("check_geometry"),
          functionCall("run_shell", { command: "anything" }),
        ],
      });
    const body = JSON.parse(String(init?.body));
    assert.match(body.input[2].output, /rejected/i);
    return provider(
      finished("Only the supported demonstration tools are available."),
    );
  };
  const res = await handleApi(agentRequest());
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.patch, null);
  assert.equal(data.steps.at(-1).tool, "rejected_tool");
});

test("a plain answer cannot bypass the mandatory geometry tools", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return provider(finished("Everything is fine."));
  };
  const res = await handleApi(agentRequest());
  assert.equal(res.status, 502);
  assert.equal((await res.json()).code, "meta_turn_limit");
  assert.equal(calls, 6);
});

test("tool count is capped before a thirteenth tool can execute", async () => {
  globalThis.fetch = async () =>
    provider({
      id: "resp_many",
      output: Array.from({ length: 13 }, (_, i) =>
        functionCall("inspect_project", {}, `call_${i}`),
      ),
    });
  const res = await handleApi(agentRequest());
  assert.equal(res.status, 502);
  assert.equal((await res.json()).code, "meta_tool_limit");
});

test("provider errors are safe and never contain upstream credential details", async () => {
  for (const [providerStatus, expectedStatus, code] of [
    [401, 401, "meta_auth_failed"],
    [429, 429, "meta_rate_limited"],
    [500, 502, "meta_request_failed"],
  ] as const) {
    globalThis.fetch = async () =>
      provider({ error: `Private upstream failure ${SECRET}` }, providerStatus);
    const res = await handleApi(agentRequest());
    assert.equal(res.status, expectedStatus);
    const body = await res.text();
    assert.equal(JSON.parse(body).code, code);
    assert.equal(body.includes(SECRET), false);
  }
});

test("provider failure never silently switches to a simulated local answer", async () => {
  globalThis.fetch = async () => {
    throw new Error(`Provider network failed with ${SECRET}`);
  };
  const res = await handleApi(agentRequest());
  assert.equal(res.status, 502);
  const data = await res.json();
  assert.equal(data.code, "meta_unavailable");
  assert.equal("mode" in data, false);
  assert.equal(JSON.stringify(data).includes(SECRET), false);
});

test("an echoed credential in model text is redacted", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return provider(
      calls === 1
        ? {
            id: "resp_1",
            output: [
              functionCall("inspect_project"),
              functionCall("check_geometry"),
            ],
          }
        : finished(`Demonstration only. ${SECRET}`),
    );
  };
  const res = await handleApi(agentRequest());
  assert.equal(res.status, 200);
  assert.equal((await res.text()).includes(SECRET), false);
});

test("local demonstration is clearly identified and requires no provider call", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("Do not call");
  };
  const res = await handleApi(
    agentRequest("Check the current design.", "local"),
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).mode, "local");
  assert.equal(called, false);
});

test("connect rejects provider redirects without following them", async () => {
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls++;
    assert.equal(init?.redirect, "manual");
    return new Response(null, { status: 302, headers: { location: "https://elsewhere.example" } });
  };
  const res = await handleApi(request("/api/meta/connect", {}, { "x-meta-api-key": SECRET }));
  assert.equal(res.status, 502);
  assert.equal((await res.json()).code, "meta_request_failed");
  assert.equal(calls, 1);
});
