import test from "node:test";
import assert from "node:assert/strict";
import { compareOptions, recommendOption } from "../src/domain/decisions";
import { applyPatch, checkProject, validateDesign } from "../src/domain/engine";
import { makeProject } from "../src/domain/fixtures";

test("alternatives expose the measured footprint and modeled open-ground tradeoff", () => {
  const project = makeProject();
  const [compact, larger] = compareOptions(project);

  assert.equal(compact.id, "compact");
  assert.equal(larger.id, "larger");
  assert.deepEqual(
    [compact.project.design.width, compact.project.design.depth],
    [20, 20],
  );
  assert.deepEqual(
    [larger.project.design.width, larger.project.design.depth],
    [28, 28],
  );
  assert.deepEqual(
    compact.metrics,
    {
      footprint: 400,
      openGround: 3520,
      nearestBoundary: 14,
      buildingClearance: 15,
    },
  );
  assert.deepEqual(larger.metrics, {
    footprint: 784,
    openGround: 3136,
    nearestBoundary: 6,
    buildingClearance: 15,
  });
  assert.ok(compact.supported && larger.supported);
  assert.match(compact.description, /Modeled open ground/);
  assert.match(compact.description, /does not establish usable garden area/);
});

test("passing alternatives preserve placement, height, roof, and the input project", () => {
  const project = makeProject();
  const snapshot = structuredClone(project);
  Object.freeze(project.design);
  Object.freeze(project.site.house);
  Object.freeze(project.site);
  Object.freeze(project);

  for (const option of compareOptions(project)) {
    assert.equal(option.project.design.x, project.design.x);
    assert.equal(option.project.design.z, project.design.z);
    assert.equal(option.project.design.height, project.design.height);
    assert.equal(option.project.design.roof, project.design.roof);
    assert.equal(option.project.revision, project.revision + 1);
    assert.deepEqual(
      applyPatch(project, option.patch).design,
      option.project.design,
    );
    assert.deepEqual(Object.keys(option.patch).sort(), ["depth", "width"]);
  }
  assert.deepEqual(project, snapshot);
});

test("repairable failures produce checked options without clearing unresolved reviews", () => {
  const original = makeProject();
  const project = {
    ...original,
    site: {
      ...original.site,
      dimensionsConfirmed: false,
      overlaysReviewed: false,
    },
    design: {
      ...original.design,
      width: 32,
      depth: 30,
      height: 26,
      x: 1,
      z: 80,
    },
  };
  const snapshot = structuredClone(project);
  assert.ok(checkProject(project).some((check) => check.outcome === "fail"));

  for (const option of compareOptions(project)) {
    assert.ok(option.supported);
    assert.equal(option.project.revision, project.revision + 1);
    assert.deepEqual(option.checks, checkProject(option.project));
    assert.ok(!option.checks.some((check) => check.outcome === "fail"));
    for (const id of ["dimensions-confirmed", "overlays-reviewed"]) {
      assert.equal(
        option.checks.find((check) => check.id === id)?.outcome,
        "review",
      );
    }
    assert.deepEqual(applyPatch(project, option.patch), option.project);
    assert.ok(
      Object.keys(option.patch).every((key) =>
        ["width", "depth", "height", "x", "z", "roof"].includes(key),
      ),
    );
  }
  assert.deepEqual(project, snapshot);
});

test("impossible sites retain failures and have no recommended option", () => {
  const original = makeProject();
  const impossible = {
    ...original,
    site: {
      ...original.site,
      width: 10,
      depth: 10,
      house: { x: 0, z: 0, width: 10, depth: 10 },
    },
  };
  const options = compareOptions(impossible);
  assert.ok(options.every((option) => !option.supported));
  assert.ok(
    options.every((option) =>
      option.checks.some((check) => check.outcome === "fail"),
    ),
  );
  assert.equal(recommendOption(options, "open-ground"), null);
  assert.equal(recommendOption(options, "floor-space"), null);
  assert.equal(recommendOption([], "floor-space"), null);
});

test("priority changes the recommendation among supported measured alternatives", () => {
  const options = compareOptions(makeProject());
  const idsBefore = options.map((option) => option.id);
  assert.equal(recommendOption(options, "open-ground")?.id, "compact");
  assert.equal(recommendOption(options, "floor-space")?.id, "larger");
  assert.deepEqual(options.map((option) => option.id), idsBefore);
  assert.ok(
    recommendOption(options, "floor-space")?.checks.some(
      (check) => check.outcome === "review",
    ),
    "A recommendation must not imply that unresolved reviews passed",
  );
  const unavailableLarger = options.map((option) =>
    option.id === "larger" ? { ...option, supported: false } : option,
  );
  assert.equal(
    recommendOption(unavailableLarger, "floor-space")?.id,
    "compact",
  );
});

test("tied recommendations use stable ids regardless of array order", () => {
  const [compact, larger] = compareOptions(makeProject());
  const tied = [{ ...larger, metrics: { ...compact.metrics } }, compact];
  for (const priority of ["open-ground", "floor-space"] as const) {
    assert.equal(recommendOption(tied, priority)?.id, "compact");
    assert.equal(recommendOption([...tied].reverse(), priority)?.id, "compact");
  }
});

test("generated dimensions stay within the accepted design bounds", () => {
  const project = applyPatch(makeProject(), { width: 60, depth: 60 });
  for (const option of compareOptions(project)) {
    assert.doesNotThrow(() => validateDesign(option.project.design));
    assert.ok(option.project.design.width >= 8);
    assert.ok(option.project.design.depth >= 8);
    assert.ok(option.project.design.width <= 60);
    assert.ok(option.project.design.depth <= 60);
  }
  const minimum = applyPatch(makeProject(), { width: 8, depth: 8 });
  for (const option of compareOptions(minimum)) {
    assert.doesNotThrow(() => validateDesign(option.project.design));
  }
});
