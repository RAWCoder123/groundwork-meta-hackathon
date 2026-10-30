import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("pilot evaluator detects independently omitted register items without inventing timings or practitioner feedback", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL("../examples/fictional-corrections.json", import.meta.url),
      "utf8",
    ),
  );
  fixture.evaluation.groundTruth.push({
    ...fixture.evaluation.groundTruth[0],
    number: "9",
    wording: "Independent reviewer item missing from extraction.",
  });
  const file = join(mkdtempSync(join(tmpdir(), "schema-eval-")), "case.json");
  writeFileSync(file, JSON.stringify(fixture));
  const report = JSON.parse(
    execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/evaluate-corrections.ts", file],
      { encoding: "utf8" },
    ),
  );
  assert.equal(report.independentRegisterComparison.missingComments, 1);
  assert.equal(report.outdatedReferences, 1);
  assert.equal(report.commentCoverage.omissions, 1);
  assert.equal(report.applicantPreparationMinutes, null);
  assert.equal(report.practitionerWillingnessToReuse, null);
  assert.equal(report.submissionReady, false);
});
