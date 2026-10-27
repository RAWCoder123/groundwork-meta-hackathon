import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPatch,
  checkProject,
  proposeRepair,
  validateDesign,
} from "../src/domain/engine";
import { DEFAULT_DESIGN, RULES, makeProject } from "../src/domain/fixtures";
import { buildPacket } from "../src/domain/packet";
import { runLocalAgent } from "../src/domain/local-agent";
import type { Check, Project } from "../src/domain/types";

function getCheck(project: Project, id: string): Check {
  const result = checkProject(project).find((check) => check.id === id);
  assert.ok(result, `Expected check ${id} to exist`);
  return result;
}

test("default demonstration site has no failing geometric checks", () => {
  const project = makeProject();
  assert.deepEqual(
    checkProject(project).filter((check) => check.outcome === "fail"),
    [],
  );
  assert.equal(
    getCheck(project, "floor-area").measured,
    project.design.width * project.design.depth,
  );
  assert.ok(RULES.length > 0);
  assert.ok(
    RULES.every((rule) => rule.kind === "demonstration"),
    "Sample numbers must not be presented as verified municipal requirements",
  );
});

test("setbacks measure from each footprint edge and include the exact threshold", () => {
  const base = makeProject();
  const project = { ...base, design: { ...base.design, x: 5, z: 71 } };
  assert.equal(getCheck(project, "west-setback").measured, 5);
  assert.equal(getCheck(project, "west-setback").outcome, "pass");
  assert.equal(
    getCheck(project, "east-setback").measured,
    project.site.width - 5 - project.design.width,
  );
  assert.equal(getCheck(project, "rear-setback").measured, 5);
  assert.equal(getCheck(project, "rear-setback").outcome, "pass");
  assert.equal(
    getCheck(
      { ...project, design: { ...project.design, x: 4.99 } },
      "west-setback",
    ).outcome,
    "fail",
  );
  assert.equal(
    getCheck(
      { ...project, design: { ...project.design, z: 71.01 } },
      "rear-setback",
    ).outcome,
    "fail",
  );
});

test("building separation uses the shortest distance between rectangles", () => {
  const base = makeProject();
  // Main house ends at (40, 51); this ADU starts 3 ft east and 4 ft behind it.
  const diagonal = { ...base, design: { ...base.design, x: 43, z: 55 } };
  assert.equal(getCheck(diagonal, "building-separation").measured, 5);
  assert.equal(getCheck(diagonal, "building-separation").outcome, "fail");
  const behind = { ...base, design: { ...base.design, x: 15, z: 57 } };
  assert.equal(getCheck(behind, "building-separation").measured, 6);
  assert.equal(getCheck(behind, "building-separation").outcome, "pass");
});

test("overlapping footprints fail and have zero separation", () => {
  const base = makeProject();
  const overlapping = { ...base, design: { ...base.design, x: 15, z: 30 } };
  assert.equal(getCheck(overlapping, "building-overlap").outcome, "fail");
  assert.equal(getCheck(overlapping, "building-separation").measured, 0);
});

test("area and height limits include exact boundary values", () => {
  const base = makeProject();
  const boundary = {
    ...base,
    design: { ...base.design, width: 25, depth: 32, height: 20 },
  };
  assert.equal(getCheck(boundary, "floor-area").measured, 800);
  assert.equal(getCheck(boundary, "floor-area").outcome, "pass");
  assert.equal(getCheck(boundary, "height").outcome, "pass");
  const tooLarge = {
    ...boundary,
    design: { ...boundary.design, depth: 32.1, height: 20.1 },
  };
  assert.equal(getCheck(tooLarge, "floor-area").outcome, "fail");
  assert.equal(getCheck(tooLarge, "height").outcome, "fail");
});

test("lot coverage includes both footprints and uses percentage units", () => {
  const base = makeProject();
  const boundary = {
    ...base,
    design: { ...base.design, width: 30, depth: 39 },
  };
  assert.equal(getCheck(boundary, "lot-coverage").measured, 45);
  assert.equal(getCheck(boundary, "lot-coverage").outcome, "pass");
  const oversized = { ...boundary, design: { ...boundary.design, depth: 40 } };
  assert.equal(getCheck(oversized, "lot-coverage").outcome, "fail");
});

test("missing measurements and overlay review remain explicit unresolved outcomes", () => {
  const base = makeProject();
  const unknown = {
    ...base,
    site: { ...base.site, dimensionsConfirmed: false, overlaysReviewed: false },
  };
  assert.equal(getCheck(unknown, "dimensions-confirmed").outcome, "review");
  assert.equal(getCheck(unknown, "overlays-reviewed").outcome, "review");
  assert.ok(checkProject(unknown).some((check) => check.outcome === "review"));
});

test("design validation rejects malformed, non-finite, out-of-range and unknown values", () => {
  for (const value of [
    null,
    [],
    { ...DEFAULT_DESIGN, width: "24 ft" },
    { ...DEFAULT_DESIGN, width: Number.NaN },
    { ...DEFAULT_DESIGN, height: Number.POSITIVE_INFINITY },
    { ...DEFAULT_DESIGN, width: 7.99 },
    { ...DEFAULT_DESIGN, depth: 60.01 },
    { ...DEFAULT_DESIGN, height: 30.01 },
    { ...DEFAULT_DESIGN, x: -100.01 },
    { ...DEFAULT_DESIGN, z: 200.01 },
    { ...DEFAULT_DESIGN, roof: "unsafe" },
    { ...DEFAULT_DESIGN, script: "unexpected field" },
  ]) {
    assert.throws(() => validateDesign(value));
  }
  assert.deepEqual(validateDesign(DEFAULT_DESIGN), DEFAULT_DESIGN);
});

test("patching is immutable, increments the revision and validates the resulting design", () => {
  const original = makeProject();
  const snapshot = structuredClone(original);
  const updated = applyPatch(original, { x: 10, width: 26 });
  assert.deepEqual(original, snapshot);
  assert.notEqual(updated, original);
  assert.notEqual(updated.design, original.design);
  assert.equal(updated.revision, original.revision + 1);
  assert.equal(updated.design.x, 10);
  assert.equal(updated.design.width, 26);
  assert.throws(() => applyPatch(original, { width: -4 }));
});

test("repair resolves a feasible combination of placement, size and height conflicts", () => {
  const base = makeProject();
  const broken = {
    ...base,
    design: { ...base.design, width: 32, depth: 30, height: 26, x: 1, z: 80 },
  };
  const snapshot = structuredClone(broken);
  assert.ok(checkProject(broken).some((check) => check.outcome === "fail"));
  const patch = proposeRepair(broken);
  assert.ok(patch, "A physically feasible repair should be proposed");
  assert.deepEqual(
    broken,
    snapshot,
    "Proposing a repair must not change project state",
  );
  const repaired = applyPatch(broken, patch);
  assert.deepEqual(
    checkProject(repaired).filter((check) => check.outcome === "fail"),
    [],
  );
});

test("repair returns no change for a passing design and never clears review flags", () => {
  const base = makeProject();
  assert.equal(proposeRepair(base), null);
  const unknown = {
    ...base,
    site: { ...base.site, dimensionsConfirmed: false, overlaysReviewed: false },
    design: { ...base.design, x: 1 },
  };
  const patch = proposeRepair(unknown);
  assert.ok(patch);
  const repaired = applyPatch(unknown, patch);
  assert.equal(getCheck(repaired, "dimensions-confirmed").outcome, "review");
  assert.equal(getCheck(repaired, "overlays-reviewed").outcome, "review");
});

test("handoff packet uses current state and safely escapes project text", () => {
  const project = applyPatch(makeProject(), { width: 26, depth: 22 });
  project.name = "<img src=x onerror=alert(1)> & draft";
  project.site.name = "<script>alert(2)</script>";
  const packet = buildPacket(project);
  assert.match(packet, /<svg\b/i, "A dimensioned concept plan is included");
  assert.match(packet, /26/);
  assert.match(packet, /22/);
  assert.ok(
    packet.includes(String(project.revision)),
    "Current revision appears",
  );
  assert.ok(!packet.includes("<img src=x"));
  assert.ok(!packet.includes("<script>alert(2)</script>"));
  assert.ok(packet.includes("&lt;img"));
  assert.ok(packet.includes("&lt;script&gt;"));
  assert.match(packet, /demonstration/i);
  assert.match(packet, /portland\.gov/);
});

test("local commands propose bounded measured edits without mutating the project or claiming a model call", () => {
  const project = makeProject();
  const snapshot = structuredClone(project);
  const movement = runLocalAgent(project, "move 5 ft west");
  assert.equal(movement.mode, "local");
  assert.equal(movement.patch?.x, project.design.x - 5);
  const dimension = runLocalAgent(project, "increase width by 4 feet");
  assert.equal(dimension.patch?.width, project.design.width + 4);
  assert.ok(
    dimension.steps.some((step) => step.tool === "check_proposed_design"),
  );
  assert.deepEqual(project, snapshot);
});

test("local commands reject unsupported or out-of-range changes without a substitute patch", () => {
  const project = makeProject();
  assert.equal(runLocalAgent(project, "set height to 500").patch, null);
  assert.equal(runLocalAgent(project, "approve my permit").patch, null);
  assert.equal(runLocalAgent(project, "design a hospital").mode, "local");
});

test("local repair uses the geometry search while preserving unknown site facts", () => {
  const project = applyPatch(makeProject(), { x: 1 });
  const response = runLocalAgent(project, "repair the design");
  assert.ok(response.patch);
  const after = applyPatch(project, response.patch);
  assert.deepEqual(
    checkProject(after).filter((check) => check.outcome === "fail"),
    [],
  );
  assert.equal(getCheck(after, "overlays-reviewed").outcome, "review");
});
