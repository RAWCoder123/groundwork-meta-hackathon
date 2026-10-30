import test from "node:test";
import assert from "node:assert/strict";
import {
  createAutoProject,
  putArtifact,
  finishStage,
  applyDecision,
  currentDecision,
  buildAutonomousPacket,
  validateProject,
} from "../src/autonomy/domain";
import {
  proposeRegister,
  confirmRegister,
  bindEvidence,
  assessCorrections,
  reviewResponse,
  replaceDocument,
  type ResponseDraft,
} from "../src/autonomy/corrections";
function fixture() {
  let p = createAutoProject("owner", "Fictional corrections case");
  p.entryPoint = "corrections";
  p.documents = [
    {
      id: "checks",
      name: "Checksheet.pdf",
      objectKey: "checks.pdf",
      sha256: "checks-hash",
      bytes: 100,
      pages: 1,
      status: "processed",
      excerpts: [
        {
          page: 1,
          text: "1. Show accessible route. 3(a). Label existing partitions. 1. Coordinate fire alarm.",
        },
      ],
      warnings: [],
      createdAt: p.createdAt,
    },
    {
      id: "drawing",
      name: "A101.pdf",
      objectKey: "drawing.pdf",
      sha256: "drawing-hash",
      bytes: 100,
      pages: 1,
      status: "processed",
      excerpts: [
        {
          page: 1,
          text: "Existing partitions are dashed. Accessible route is indicated.",
        },
      ],
      warnings: [],
      createdAt: p.createdAt,
    },
  ];
  p = proposeRegister(p, [
    {
      number: "1",
      wording: "Show accessible route.",
      discipline: "Life safety",
      source: {
        documentId: "checks",
        page: 1,
        quote: "Show accessible route.",
      },
      uncertain: false,
    },
    {
      number: "3(a)",
      wording: "Label existing partitions.",
      discipline: "Building",
      source: {
        documentId: "checks",
        page: 1,
        quote: "Label existing partitions.",
      },
      uncertain: false,
    },
    {
      number: "1",
      wording: "Coordinate fire alarm.",
      discipline: "Fire",
      source: {
        documentId: "checks",
        page: 1,
        quote: "Coordinate fire alarm.",
      },
      uncertain: false,
    },
  ]);
  p = confirmRegister(p, p.corrections!.revision);
  return p;
}
function prepared() {
  let p = fixture();
  p = putArtifact(p, "understanding", {
    summary: "Fictional corrections; original scope retained.",
  });
  p = finishStage(p);
  p = applyDecision(p, currentDecision(p)!.id, "approve");
  assert.equal(p.stage, "preparation");
  return p;
}
function row(
  p: ReturnType<typeof fixture>,
  i: number,
  evidence = true,
): ResponseDraft {
  const c = p.corrections!.comments[i];
  return {
    itemId: c.id,
    comment: c.wording,
    response: "Draft for professional review",
    evidence: evidence
      ? [
          bindEvidence(p, {
            documentId: "drawing",
            page: 1,
            quote: "Existing partitions are dashed.",
          }),
        ]
      : [],
    missing: [],
  };
}
test("register preserves numbering gaps, nested numbers and duplicate numbering across disciplines", () => {
  const p = fixture();
  assert.deepEqual(
    p.corrections!.comments.map((c) => c.number),
    ["1", "3(a)", "1"],
  );
  assert.equal(new Set(p.corrections!.comments.map((c) => c.id)).size, 3);
  assert.equal(validateProject(p).corrections!.confirmedRevision, 1);
});
test("authoritative register detects omitted item, missing evidence and duplicate response independently", () => {
  let p = prepared();
  p = putArtifact(p, "preparation", {
    responses: [row(p, 0), row(p, 1, false), row(p, 1, false)],
  });
  const report = assessCorrections(p);
  for (const code of [
    "omitted_comment",
    "missing_evidence",
    "duplicate_response",
    "unreviewed_response",
  ])
    assert.ok(report.issues.some((i) => i.code === code));
  assert.equal(report.submissionReady, false);
});
test("fabricated quotations and nonexistent immutable revisions are rejected", () => {
  const p = fixture();
  assert.throws(
    () =>
      bindEvidence(p, {
        documentId: "drawing",
        page: 1,
        quote: "Fabricated approval.",
      }),
    /quotation/,
  );
  assert.throws(
    () =>
      bindEvidence(p, {
        documentId: "drawing",
        page: 1,
        quote: "Existing partitions are dashed.",
        revision: 77,
      }),
    /revision/,
  );
  assert.throws(
    () =>
      bindEvidence(p, {
        documentId: "drawing",
        page: 1,
        quote: "Existing partitions are dashed.",
        sha256: "invented",
      }),
    /content/,
  );
  assert.throws(
    () =>
      proposeRegister(p, [
        {
          number: "1",
          wording: "City approved",
          source: {
            documentId: "checks",
            page: 1,
            quote: "Show accessible route.",
          },
        },
      ]),
    /wording/,
  );
});
test("source replacement preserves historical review and invalidates only dependent response fingerprints", () => {
  let p = prepared();
  const first = row(p, 0),
    second = {
      ...row(p, 1),
      evidence: [
        bindEvidence(p, {
          documentId: "checks",
          page: 1,
          quote: "Label existing partitions.",
        }),
      ],
    };
  p = putArtifact(p, "preparation", {
    responses: [first, second, row(p, 2, false)],
  });
  p = reviewResponse(
    p,
    first.itemId,
    true,
    "Passage supports the draft only; technical adequacy requires professional review.",
  );
  p = reviewResponse(p, second.itemId, true, "Reviewed original wording");
  p.documents.push({
    ...p.documents[1],
    id: "new-drawing",
    sha256: "new-hash",
    objectKey: "new.pdf",
  });
  p = replaceDocument(p, "drawing", "new-drawing");
  const report = assessCorrections(p);
  assert.equal(report.items[0].reviewed, false);
  assert.equal(report.items[1].reviewed, true);
  assert.equal(p.corrections!.reviews.length, 2);
  assert.equal(p.documents.find((d) => d.id === "new-drawing")!.revision, 2);
  assert.ok(
    report.issues.some((i) => i.code === "outdated_or_invalid_evidence"),
  );
  assert.equal(validateProject(p).corrections!.comments.length, 3);
});
test("unread pages and extraction uncertainty block completeness without claiming city acceptance", () => {
  let p = prepared();
  p.documents[0].pages = 2;
  p = putArtifact(p, "preparation", {
    responses: p.corrections!.comments.map((_, i) => row(p, i)),
  });
  for (const c of p.corrections!.comments)
    p = reviewResponse(p, c.id, true, "Confirmed passage support");
  const report = assessCorrections(p);
  assert.equal(report.submissionReady, false);
  assert.ok(report.issues.some((i) => i.code === "unread_page"));
  assert.ok(report.items.every((i) => i.cityAccepted === false));
  p = proposeRegister(
    p,
    p.corrections!.comments.map((c) => ({ ...c, uncertain: true })),
  );
  assert.throws(() => confirmRegister(p, p.corrections!.revision), /uncertain/);
});
test("matching reviewed coordination handoff keeps omissions and responsibilities visible", () => {
  let p = prepared();
  p = putArtifact(p, "preparation", { responses: [row(p, 0)] });
  p = finishStage(p);
  p = putArtifact(p, "handoff", {
    summary: "Coordination only",
    unresolved: ["Professional drawings missing"],
  });
  p = finishStage(p);
  p = applyDecision(p, currentDecision(p)!.id, "approve");
  const html = buildAutonomousPacket(p);
  assert.match(html, /omitted_comment/);
  assert.match(html, /Coordinate fire alarm/);
  assert.match(html, /not complete permit drawings/);
  assert.equal(assessCorrections(p).submissionReady, false);
});
test("editing one register comment preserves the unrelated response review", () => {
  let p = prepared();
  p = putArtifact(p, "preparation", {
    responses: [row(p, 0), row(p, 1), row(p, 2, false)],
  });
  p = reviewResponse(p, p.corrections!.comments[0].id, true, "Reviewed");
  p = reviewResponse(p, p.corrections!.comments[1].id, true, "Reviewed");
  const comments = structuredClone(p.corrections!.comments);
  comments[0].discipline = "Accessibility";
  p = proposeRegister(p, comments);
  const report = assessCorrections(p);
  assert.equal(report.items[0].reviewed, false);
  assert.equal(report.items[1].reviewed, true);
  assert.equal(report.confirmed, false);
});
test("new nested comments map extraction labels to stable server IDs without merging them", () => {
  const p = fixture();
  const source = {
    documentId: "checks",
    page: 1,
    quote: "Show accessible route.",
  };
  const next = proposeRegister(p, [
    {
      id: "parent",
      number: "1",
      wording: "Show accessible route.",
      source,
      uncertain: false,
    },
    {
      id: "child",
      parentId: "parent",
      number: "1(a)",
      wording: "Show accessible route.",
      source,
      uncertain: false,
    },
  ]);
  assert.equal(
    next.corrections!.comments[1].parentId,
    next.corrections!.comments[0].id,
  );
  assert.notEqual(next.corrections!.comments[0].id, "parent");
  assert.equal(validateProject(next).corrections!.comments.length, 2);
});
