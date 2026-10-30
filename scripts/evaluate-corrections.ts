import { readFileSync } from "node:fs";
import { validateProject } from "../src/autonomy/domain";
import { assessCorrections, responseRows } from "../src/autonomy/corrections";
const input = process.argv[2];
if (!input)
  throw new Error(
    "Provide an authorized project bundle or the fictional example.",
  );
const bundle = JSON.parse(readFileSync(input, "utf8")),
  p = validateProject(bundle.project ?? bundle),
  report = assessCorrections(p),
  evaluation = bundle.evaluation ?? {};
const minutes = (key: string) => {
  const value = evaluation[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(
      "Timing observations must be nonnegative measured minutes.",
    );
  return value;
};
const groundTruth = evaluation.groundTruth;
if (
  groundTruth !== undefined &&
  (!Array.isArray(groundTruth) || groundTruth.length > 150)
)
  throw new Error(
    "Ground truth must be a bounded independently reviewed comment list.",
  );
const key = (v: {
  number: string;
  discipline: string;
  wording: string;
  page: number;
  documentSha256: string;
}) =>
  JSON.stringify([
    v.documentSha256,
    v.page,
    v.number,
    v.discipline,
    v.wording.replace(/\s+/g, " ").trim(),
  ]);
let independentlyMissingComments: number | null = null,
  unexpectedRegisterItems: number | null = null;
if (groundTruth) {
  const expected = new Map<string, number>(),
    actual = new Map<string, number>();
  for (const item of groundTruth) {
    const k = key(item);
    expected.set(k, (expected.get(k) ?? 0) + 1);
  }
  for (const comment of p.corrections?.comments ?? []) {
    const k = key({
      ...comment,
      page: comment.source.page,
      documentSha256: comment.source.sha256,
    });
    actual.set(k, (actual.get(k) ?? 0) + 1);
  }
  independentlyMissingComments = [...expected].reduce(
    (n, [k, count]) => n + Math.max(0, count - (actual.get(k) ?? 0)),
    0,
  );
  unexpectedRegisterItems = [...actual].reduce(
    (n, [k, count]) => n + Math.max(0, count - (expected.get(k) ?? 0)),
    0,
  );
}
let outdatedReferences = 0,
  incorrectLiteralReferences = 0;
for (const row of responseRows(p))
  for (const ref of row.evidence) {
    const doc = p.documents.find((d) => d.id === ref.documentId);
    if (doc?.supersededBy || (doc && ref.revision !== (doc.revision ?? 1)))
      outdatedReferences++;
    if (
      !doc ||
      doc.sha256 !== ref.sha256 ||
      !doc.excerpts.some(
        (e) => e.page === ref.page && e.text.includes(ref.quote),
      )
    )
      incorrectLiteralReferences++;
  }
const output = {
  caseId: p.id,
  sourceProjectRevision: p.version,
  fixture: evaluation.fixture === true,
  runAt: new Date().toISOString(),
  registerConfirmed: report.confirmed,
  independentRegisterComparison: {
    available: !!groundTruth,
    missingComments: independentlyMissingComments,
    unexpectedItems: unexpectedRegisterItems,
  },
  commentCoverage: {
    responsesAccountedFor: report.coverage,
    registeredComments: report.total,
    omissions: report.issues.filter((i) => i.code === "omitted_comment").length,
  },
  incorrectLiteralReferences,
  outdatedReferences,
  semanticEvidenceErrors:
    evaluation.practitionerConfirmedSemanticErrors ?? null,
  applicantPreparationMinutes: minutes("applicantPreparationMinutes"),
  humanReviewMinutes: minutes("humanReviewMinutes"),
  manualBaselineMinutes: minutes("manualBaselineMinutes"),
  unresolvedAtHandoff: report.items.filter(
    (i) => !i.drafted || !i.reviewed || !i.supported || i.unresolved.length,
  ).length,
  practitionerWillingnessToReuse:
    typeof evaluation.practitionerWillingnessToReuse === "boolean"
      ? evaluation.practitionerWillingnessToReuse
      : null,
  submissionReady: false,
  issues: report.issues,
  limitations: [
    "Literal quotation matching does not establish semantic or technical support.",
    "Register coverage depends on human confirmation against the complete original checksheet.",
    "Unknown timing and practitioner feedback remain null; no savings or demand are inferred.",
  ],
};
console.log(JSON.stringify(output, null, 2));
