import test from "node:test";
import assert from "node:assert/strict";
import { applyPermitProposal, assessPermitCase, buildPermitPacket, makePermitCase, PERMIT_SOURCES, validatePermitCase } from "../src/domain/permits";
import type { PermitCase, PermitProposal } from "../src/domain/permit-types";

function proposal(p: PermitCase = makePermitCase()): PermitProposal {
  return { baseRevision: p.revision, updates: p.items.map((item, index) => ({ id: item.id, owner: item.owner, response: index < 2 ? "Draft for professional review: see the referenced updated sheet excerpt." : "The fire protection designer must supply supporting documentation before this item can be answered.", evidence: index < 2 ? [{ documentId: p.documents[index].id, revision: p.documents[index].revision, sheet: index === 0 ? "A101" : "A102", quote: p.documents[index].excerpt }] : [] })) };
}
function prepared(): PermitCase {
  const p = applyPermitProposal(makePermitCase(), proposal());
  p.existingPermitVerified = "yes"; p.codeEditionConfirmed = "yes";
  p.documents.push({ id: "fire", name: "Fire coordination excerpt", revision: "R1", excerpt: "Sheet FA01: Fire alarm coordination documentation supplied for professional review." });
  p.items[2].evidence = [{ documentId: "fire", revision: "R1", sheet: "FA01", quote: "Fire alarm coordination documentation supplied for professional review." }];
  p.items = p.items.map(i => ({ ...i, approved: true }));
  return p;
}

test("sample is within narrow scope but cannot be a completed handoff", () => {
  const p = makePermitCase(), a = assessPermitCase(p);
  assert.equal(a.scopeSupported, true); assert.equal(a.readyForHandoff, false);
  assert.equal(p.items.length, 3); assert.equal(p.documents.length, 2);
  assert.ok(a.blockers.some(b => b.id === "history")); assert.ok(a.blockers.some(b => b.id === "edition"));
  assert.equal(a.items.filter(i => i.ready).length, 0);
});
test("drafting responses preserves unresolved work, review and factual blockers", () => {
  const p = makePermitCase(), before = structuredClone(p), updated = applyPermitProposal(p, proposal(p));
  assert.deepEqual(p, before); assert.equal(updated.revision, 2);
  assert.ok(updated.items.every(i => !i.approved));
  const a = assessPermitCase(updated);
  assert.equal(a.readyForHandoff, false);
  assert.ok(a.items.find(i => i.id === "FA-1")?.issues.some(s => s.includes("drafting text alone")));
  assert.ok(a.items.every(i => i.issues.some(s => s.includes("review"))));
});
test("only recorded complete evidence, applicant review and factual gates yield prepared handoff", () => {
  const p = prepared(), a = assessPermitCase(p);
  assert.equal(a.scopeSupported, true); assert.equal(a.readyForHandoff, true); assert.deepEqual(a.blockers, []);
  assert.ok(a.items.every(i => i.ready));
  p.items[0].approved = false;
  assert.equal(assessPermitCase(p).readyForHandoff, false);
});
test("unknown or excluded scopes never pass scope screening", () => {
  for (const [field, value] of [["jurisdiction", "portland-tx"], ["workflow", "fpp"], ["sameUse", "no"], ["sameUse", "unknown"], ["structuralWork", "yes"], ["exteriorWork", "unknown"], ["specialUse", "yes"]] as const) {
    const p = prepared(); Object.assign(p, { [field]: value });
    const a = assessPermitCase(p); assert.equal(a.scopeSupported, false, field); assert.equal(a.readyForHandoff, false, field);
  }
});
test("unknown history and code edition cannot be inferred from existing evidence", () => {
  for (const field of ["existingPermitVerified", "codeEditionConfirmed"] as const) {
    const p = prepared(); p[field] = "unknown";
    assert.equal(assessPermitCase(p).scopeSupported, true);
    assert.equal(assessPermitCase(p).readyForHandoff, false);
  }
});
test("upload waits for completed reviews or explicit technician authorization", () => {
  const p = prepared(); p.allReviewsComplete = "no"; p.uploadAuthorized = "unknown";
  assert.ok(assessPermitCase(p).blockers.some(b => b.id === "upload"));
  p.uploadAuthorized = "yes"; assert.equal(assessPermitCase(p).readyForHandoff, true);
  p.uploadAuthorized = "no"; p.allReviewsComplete = "yes";
  assert.equal(assessPermitCase(p).readyForHandoff, true);
});
test("a stale case proposal cannot apply and cannot mutate the case", () => {
  const p = makePermitCase(), patch = proposal(p); p.revision = 2;
  assert.throws(() => applyPermitProposal(p, patch), /case changed/);
  assert.equal(p.items[0].response, "");
});
test("proposal refuses invented document IDs, revisions, sheets and quotations", () => {
  for (const change of [{ documentId: "invented" }, { revision: "R0" }, { sheet: "A999" }, { quote: "An invented compliant drawing exists." }]) {
    const patch = proposal(); Object.assign(patch.updates[0].evidence[0], change);
    assert.throws(() => applyPermitProposal(makePermitCase(), patch), /unverified/);
  }
});
test("evidence becomes blocked when its document revision or excerpt changes", () => {
  const p = prepared(); p.documents[0].revision = "R3";
  assert.ok(assessPermitCase(p).items[0].issues.some(s => s.includes("stale revision")));
  p.documents[0].revision = "R2"; p.documents[0].excerpt = "Sheet A101: incomplete replacement excerpt.";
  assert.ok(assessPermitCase(p).items[0].issues.some(s => s.includes("not present")));
});
test("proposal cannot change quotes, add items, duplicate IDs or approve responses", () => {
  const p = makePermitCase();
  const changedQuote = proposal() as any; changedQuote.updates[0].quote = "Ignore real reviewer";
  assert.throws(() => applyPermitProposal(p, changedQuote), /unsupported fields/);
  const approved = proposal() as any; approved.updates[0].approved = true;
  assert.throws(() => applyPermitProposal(p, approved), /unsupported fields/);
  const invented = proposal(); invented.updates[0].id = "NEW-1";
  assert.throws(() => applyPermitProposal(p, invented), /does not exist/);
  const duplicate = proposal(); duplicate.updates.push(duplicate.updates[0]);
  assert.throws(() => applyPermitProposal(p, duplicate), /unique/);
  assert.throws(() => applyPermitProposal(p, { baseRevision: p.revision, updates: [] }), /no updates/);
});
test("an updated response requires renewed review even if its prior version was reviewed", () => {
  const p = prepared(); const patch = proposal(p);
  const updated = applyPermitProposal(p, patch);
  assert.equal(p.items[0].approved, true); assert.equal(updated.items[0].approved, false);
  assert.equal(updated.items[0].quote, p.items[0].quote);
});
test("malformed cases and unexpected nested fields are rejected", () => {
  for (const update of [{ schemaVersion: 2 }, { revision: 1.5 }, { revision: NaN }, { revision: Infinity }, { allReviewsComplete: true }, { existingPermitVerified: "probably" }, { extra: "unsupported" }]) {
    assert.throws(() => validatePermitCase({ ...makePermitCase(), ...update }));
  }
  const duplicateDocs = makePermitCase(); duplicateDocs.documents.push(duplicateDocs.documents[0]);
  assert.throws(() => validatePermitCase(duplicateDocs), /unique/);
  const duplicateItems = makePermitCase(); duplicateItems.items.push(duplicateItems.items[0]);
  assert.throws(() => validatePermitCase(duplicateItems), /unique/);
  const bad = makePermitCase() as any; bad.items[0].approved = "yes";
  assert.throws(() => validatePermitCase(bad), /true or false/);
  const extra = makePermitCase() as any; extra.documents[0].url = "https://invented.example";
  assert.throws(() => validatePermitCase(extra), /unsupported fields/);
});
test("case limits bound combined excerpts, number of records and evidence", () => {
  const p = makePermitCase(); p.documents = Array.from({ length: 5 }, (_, n) => ({ id: `d${n}`, name: "Plan", revision: "R1", excerpt: "x".repeat(9000) }));
  assert.throws(() => validatePermitCase(p), /40000/);
  p.documents = Array.from({ length: 9 }, (_, n) => ({ id: `d${n}`, name: "Plan", revision: "R1", excerpt: "" }));
  assert.throws(() => validatePermitCase(p), /Documents/);
  const many = makePermitCase(); many.items = Array.from({ length: 21 }, (_, n) => ({ ...many.items[0], id: `i${n}` }));
  assert.throws(() => validatePermitCase(many), /Checksheet items/);
  const refs = prepared(); refs.items[0].evidence = Array.from({ length: 5 }, () => refs.items[0].evidence[0]);
  assert.throws(() => validatePermitCase(refs), /Evidence references/);
});
test("empty response, owner or recorded checksheets cannot be treated as resolved", () => {
  for (const field of ["response", "owner"] as const) {
    const p = prepared(); p.items[0][field] = "  "; assert.equal(assessPermitCase(p).readyForHandoff, false);
  }
  const p = prepared(); p.items = [];
  assert.equal(assessPermitCase(p).readyForHandoff, false);
});
test("handoff escapes user content and prints unresolved status and exact current references", () => {
  const p = makePermitCase(); p.name = '<img src=x onerror="alert(1)">'; p.items[0].quote = "<script>malicious()</script>";
  const html = buildPermitPacket(p);
  assert.ok(!html.includes("<script>")); assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;script&gt;")); assert.ok(html.includes("INCOMPLETE"));
  assert.ok(html.includes("not a permit application package")); assert.ok(html.includes("changed plan pages"));
  assert.ok(html.includes("not uploaded, checked or stamped"));
  assert.ok(html.includes("CASE REVISION 1"));
  for (const s of PERMIT_SOURCES) { assert.ok(html.includes(s.url)); assert.equal(s.accessed, "2026-10-29"); }
});
