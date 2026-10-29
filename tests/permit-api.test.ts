import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { handlePermits } from "../server/permits";
import { makePermitCase } from "../src/domain/permits";
import type { PermitCase } from "../src/domain/permit-types";
const originalFetch = globalThis.fetch;
const SECRET = "meta-test-key-never-real";
const origin = "https://schema.example";
afterEach(() => { globalThis.fetch = originalFetch; });
function request(permitCase = makePermitCase(), extra: Record<string, string> = {}) {
  return new Request(origin + "/api/permits", { method: "POST", headers: { Origin: origin, "content-type": "application/json", "x-meta-api-key": SECRET, ...extra }, body: JSON.stringify({ case: permitCase, message: "Draft responses and identify missing evidence." }) });
}
function provider(output: unknown[], id = "resp_1") { return new Response(JSON.stringify({ id, status: "completed", output }), { headers: { "content-type": "application/json" } }); }
function call(name: string, args: unknown = {}, id = name) { return { type: "function_call", name, arguments: JSON.stringify(args), call_id: id }; }
function final(selected: string | null = null, message = "Draft responses require applicant review; fire alarm evidence is missing.") { return [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ message, selectedProposalId: selected }) }] }]; }
function update(permitCase: PermitCase) {
  const d = permitCase.documents[0];
  return { id: permitCase.items[0].id, owner: "Architect", response: "Draft: see the supplied A101 excerpt. The responsible architect must verify the actual plan.", evidence: [{ documentId: d.id, revision: d.revision, sheet: "A101", quote: "Existing partitions remain solid; demolished partitions are dashed; proposed non-load-bearing partitions are hatched." }] };
}

test("permit requests require origin, JSON, supported scope and a key before provider access", async () => {
  globalThis.fetch = async () => { assert.fail("Must not contact Meta"); };
  assert.equal((await handlePermits(request(undefined, { Origin: "https://other.example" }))).status, 403);
  assert.equal((await handlePermits(request(undefined, { "content-type": "text/plain" }))).status, 415);
  const missing = request(); missing.headers.delete("x-meta-api-key");
  assert.equal((await handlePermits(missing)).status, 409);
  const unsupported = makePermitCase(); unsupported.structuralWork = "yes";
  assert.equal((await handlePermits(request(unsupported))).status, 409);
});

test("permit request validation bounds streamed bytes, messages and unknown fields", async () => {
  globalThis.fetch = async () => { assert.fail("Must reject locally"); };
  const large = new Request(origin + "/api/permits", { method: "POST", headers: { Origin: origin, "content-type": "application/json" }, body: "x".repeat(90_001) });
  assert.equal((await handlePermits(large)).status, 413);
  for (const body of [{ case: makePermitCase(), message: "x".repeat(2001) }, { case: makePermitCase(), message: "Draft", key: SECRET }]) {
    const r = new Request(origin + "/api/permits", { method: "POST", headers: { Origin: origin, "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await handlePermits(r)).status, 400);
  }
});

test("Meta permit loop validates evidence and returns unapplied reviewed drafts with encrypted reasoning continuity", async () => {
  const permitCase = makePermitCase(); const before = structuredClone(permitCase); let turn = 0;
  const reasoning = { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "opaque-reasoning-not-for-client" };
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.meta.ai/v1/responses"); assert.equal(init?.redirect, "manual");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${SECRET}`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false); assert.deepEqual(body.include, ["reasoning.encrypted_content"]);
    assert.equal(body.text.format.type, "json_schema"); assert.equal(body.model, "muse-spark-1.3");
    turn++;
    if (turn === 1) return provider([reasoning, call("inspect_permit_case"), call("assess_correction_readiness")]);
    assert.ok(body.input.some((i: {encrypted_content?: string}) => i.encrypted_content === reasoning.encrypted_content));
    if (turn === 2) return provider([call("propose_correction_responses", { updates: [update(permitCase)] })], "resp_2");
    return provider(final("proposal_1"), "resp_final");
  };
  const r = await handlePermits(request(permitCase)); assert.equal(r.status, 200);
  const result = await r.json(); assert.equal(result.mode, "meta"); assert.equal(result.proposal.baseRevision, permitCase.revision);
  assert.equal(result.proposal.updates.length, 1); assert.equal(result.steps.length, 3);
  assert.equal(result.proposal.updates[0].approved, undefined); assert.deepEqual(permitCase, before);
  assert.ok(!JSON.stringify(result).includes("opaque-reasoning"));
});

test("a final answer cannot skip required case inspection and readiness assessment", async () => {
  let turns = 0; globalThis.fetch = async () => { turns++; return provider(final()); };
  const r = await handlePermits(request()); assert.equal(r.status, 502);
  assert.equal((await r.json()).code, "meta_turn_limit"); assert.equal(turns, 6);
});

test("invented evidence or stale references cannot produce a selectable proposal", async () => {
  for (const change of [{ quote: "A compliant accessible ramp was constructed." }, { revision: "R1" }, { sheet: "A999" }]) {
    let turns = 0; const p = makePermitCase(); const u = update(p); Object.assign(u.evidence[0], change);
    globalThis.fetch = async () => {
      turns++;
      if (turns === 1) return provider([call("inspect_permit_case"), call("assess_correction_readiness")]);
      if (turns === 2) return provider([call("propose_correction_responses", { updates: [u] })]);
      return provider(final("proposal_1"));
    };
    const r = await handlePermits(request(p)); assert.equal(r.status, 502);
    assert.equal((await r.json()).code, "meta_unverified_proposal");
  }
});

test("the model cannot alter reviewer comments, facts or applicant approval", async () => {
  let turns = 0; const p = makePermitCase();
  globalThis.fetch = async () => {
    turns++;
    if (turns === 1) return provider([call("inspect_permit_case"), call("assess_correction_readiness")]);
    if (turns === 2) return provider([call("propose_correction_responses", { updates: [{ ...update(p), approved: true }] })]);
    return provider(final("proposal_1"));
  };
  const r = await handlePermits(request(p)); assert.equal(r.status, 502); assert.equal((await r.json()).code, "meta_unverified_proposal");
});

test("unsupported tools are rejected and bounded rather than executed", async () => {
  let turns = 0;
  globalThis.fetch = async () => {
    turns++; return provider([call("submit_to_devhub", { approved: true }, "unknown_" + turns)]);
  };
  const r = await handlePermits(request()); assert.equal(r.status, 502); assert.equal(turns, 6);
});

test("permit agent rejects redirects and provider failures without exposing keys or fallback", async () => {
  for (const status of [302, 401, 429, 500]) {
    let count = 0;
    globalThis.fetch = async (_url, init) => {
      count++; assert.equal(init?.redirect, "manual");
      return new Response(SECRET, { status, headers: { location: "https://elsewhere.example" } });
    };
    const r = await handlePermits(request()); assert.equal(r.status, status === 401 || status === 429 ? status : 502);
    const raw = await r.text(); assert.ok(!raw.includes(SECRET)); assert.ok(!raw.includes('"mode":"local"')); assert.equal(count, 1);
  }
});

test("echoed credentials are removed from model explanations and drafts", async () => {
  let turns = 0;
  globalThis.fetch = async () => {
    turns++;
    return turns === 1 ? provider([call("inspect_permit_case"), call("assess_correction_readiness")]) : provider(final(null, `Pending review ${SECRET}`));
  };
  const r = await handlePermits(request()); assert.equal(r.status, 200);
  const raw = await r.text(); assert.ok(!raw.includes(SECRET)); assert.ok(raw.includes("[redacted]"));
});

test("tool limit rejects a thirteenth call and malformed provider data stays bounded", async () => {
  globalThis.fetch = async () => provider(Array.from({ length: 13 }, (_, i) => call("inspect_permit_case", {}, "call_" + i)));
  const r = await handlePermits(request()); assert.equal((await r.json()).code, "meta_tool_limit");
  globalThis.fetch = async () => new Response("x".repeat(1_048_577));
  const large = await handlePermits(request()); assert.equal((await large.json()).code, "meta_invalid_response");
});
