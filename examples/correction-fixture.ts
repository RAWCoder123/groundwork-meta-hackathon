import {
  createAutoProject,
  putArtifact,
  finishStage,
  applyDecision,
  currentDecision,
} from "../src/autonomy/domain";
import {
  proposeRegister,
  confirmRegister,
  bindEvidence,
  reviewResponse,
  replaceDocument,
} from "../src/autonomy/corrections";
import type { DocumentRef } from "../src/autonomy/types";
/** Text-only fictional inputs for repeatable checks, never professional drawings. */
export function fixturePdf(lines: string[]) {
  const escape = (v: string) => v.replace(/[\\()]/g, "\\$&");
  const content =
    "BT /F1 11 Tf 40 750 Td 16 TL " +
    lines
      .map((line, i) => (i ? "T* " : "") + "(" + escape(line) + ") Tj")
      .join(" ") +
    " ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let raw = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(raw.length);
    raw += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = raw.length;
  raw +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(raw);
}
export const fixtureFiles = [
  {
    name: "fictional-checksheet.pdf",
    lines: [
      "CONTROLLED FICTIONAL CHECKSHEET - NO REAL CITY REVIEW",
      "Building 1: Identify existing partitions.",
      "Building 3(a): Show the accessible route and door clearances.",
      "Fire 1: Coordinate fire alarm documentation.",
      "Duplicate numbering and nested numbering are intentional test inputs.",
    ],
  },
  {
    name: "fictional-drawing-R1.pdf",
    lines: [
      "CONTROLLED FICTIONAL DRAWING R1 - TEXT TEST INPUT ONLY",
      "Existing partitions are dashed.",
      "No professionally prepared drawings or technical compliance are established.",
    ],
  },
  {
    name: "fictional-drawing-R2.pdf",
    lines: [
      "CONTROLLED FICTIONAL DRAWING R2 - TEXT TEST INPUT ONLY",
      "Partition locations changed; reassess the previous response.",
      "Accessible route and fire alarm design remain unresolved.",
    ],
  },
];
export function buildCorrectionFixture(
  ownerId: string,
  documents: DocumentRef[],
) {
  let p = createAutoProject(
    ownerId,
    "CONTROLLED TEST - fictional Portland corrections with duplicate numbering, an omitted response, missing evidence, and a revised drawing. No live Meta or practitioner result is represented.",
  );
  p.entryPoint = "corrections";
  p.documents = documents;
  const [checks, drawing, replacement] = documents;
  p = proposeRegister(p, [
    {
      id: "building",
      number: "1",
      wording: "Identify existing partitions.",
      discipline: "Building",
      source: {
        documentId: checks.id,
        page: 1,
        quote: "Identify existing partitions.",
      },
      uncertain: false,
    },
    {
      id: "subitem",
      parentId: null,
      number: "3(a)",
      wording: "Show the accessible route and door clearances.",
      discipline: "Building",
      source: {
        documentId: checks.id,
        page: 1,
        quote: "Show the accessible route and door clearances.",
      },
      uncertain: false,
    },
    {
      id: "fire",
      number: "1",
      wording: "Coordinate fire alarm documentation.",
      discipline: "Fire",
      source: {
        documentId: checks.id,
        page: 1,
        quote: "Coordinate fire alarm documentation.",
      },
      uncertain: false,
    },
  ]);
  p = confirmRegister(p, p.corrections!.revision);
  p = putArtifact(p, "understanding", {
    summary:
      "Controlled fictional correction coordination. Existing scope and legal status remain unverified.",
  });
  p = finishStage(p);
  p = applyDecision(p, currentDecision(p)!.id, "approve");
  p = putArtifact(p, "preparation", {
    summary: "A controlled test intentionally retaining unresolved work.",
    responses: [
      {
        itemId: p.corrections!.comments[0].id,
        comment: p.corrections!.comments[0].wording,
        response:
          "Existing partitions are shown dashed in the R1 test source; professional drawings remain missing.",
        evidence: [
          bindEvidence(p, {
            documentId: drawing.id,
            page: 1,
            quote: "Existing partitions are dashed.",
          }),
        ],
        missing: ["Professional drawings and review."],
        conceptRevision: null,
      },
      {
        itemId: p.corrections!.comments[1].id,
        comment: p.corrections!.comments[1].wording,
        response: "Accessibility documentation remains outstanding.",
        evidence: [],
        missing: ["Accessible route and door clearance evidence."],
        conceptRevision: null,
      },
    ],
  });
  p = reviewResponse(
    p,
    p.corrections!.comments[0].id,
    true,
    "Controlled test actor reviewed R1 before replacement; no practitioner acceptance.",
  );
  p = replaceDocument(p, drawing.id, replacement.id);
  p.status = "needs_input";
  p.questions = [
    "Inspect the deliberately unresolved controlled test. No Meta generation, practitioner review or city acceptance occurred.",
  ];
  p.title = "CONTROLLED TEST — revisions and coverage";
  return p;
}
