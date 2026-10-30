import { sha256 } from "@noble/hashes/sha2.js";
import type { AutoProject, DocumentRef } from "./types";
export type PageEvidence = {
  documentId: string;
  revision: number;
  sha256: string;
  page: number;
  quote: string;
};
export type ReviewComment = {
  id: string;
  number: string;
  wording: string;
  discipline: string;
  responsible: string;
  parentId: string | null;
  source: PageEvidence;
  uncertain: boolean;
};
export type ResponseDraft = {
  itemId: string;
  comment: string;
  response: string;
  evidence: PageEvidence[];
  missing: string[];
  conceptRevision?: number | null;
};
export type ResponseReview = {
  commentId: string;
  fingerprint: string;
  reviewedAt: string;
  supportConfirmed: boolean;
  note: string;
};
export type CorrectionState = {
  revision: number;
  confirmedRevision: number | null;
  comments: ReviewComment[];
  reviews: ResponseReview[];
  history: { at: string; action: string; revision: number; detail: string }[];
};
const now = () => new Date().toISOString();
const bounded = (v: unknown, max: number, empty = false) => {
  if (typeof v !== "string" || v.length > max || (!empty && !v.trim()))
    throw new Error("Review text is missing or exceeds its limit.");
  return v as string;
};
const positive = (v: unknown) => {
  if (!Number.isSafeInteger(v) || Number(v) < 1)
    throw new Error("Invalid document revision or page.");
  return Number(v);
};
export function bindEvidence(
  p: AutoProject,
  raw: unknown,
  allowHistorical = false,
): PageEvidence {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Invalid page reference.");
  const r = raw as Record<string, unknown>;
  const doc = p.documents.find((d) => d.id === r.documentId);
  const page = positive(r.page),
    quote = bounded(r.quote, 8000);
  if (
    !doc ||
    (!allowHistorical && doc.supersededBy) ||
    !doc.excerpts.some((e) => e.page === page && e.text.includes(quote))
  )
    throw new Error("The quotation does not match a current registered page.");
  if (
    (r.revision !== undefined && r.revision !== (doc.revision ?? 1)) ||
    (r.sha256 !== undefined && r.sha256 !== doc.sha256)
  )
    throw new Error(
      "The evidence content or document revision does not match.",
    );
  return {
    documentId: doc.id,
    revision: doc.revision ?? 1,
    sha256: doc.sha256,
    page,
    quote,
  };
}
export function validateCorrectionState(p: AutoProject) {
  const c = p.corrections;
  if (!c) return;
  positive(c.revision);
  if (c.confirmedRevision !== null && c.confirmedRevision !== c.revision)
    throw new Error("Register confirmation is stale.");
  if (
    !Array.isArray(c.comments) ||
    c.comments.length > 150 ||
    !Array.isArray(c.reviews) ||
    c.reviews.length > 600 ||
    !Array.isArray(c.history) ||
    c.history.length > 500
  )
    throw new Error("Correction register exceeds its supported size.");
  const ids = new Set<string>();
  for (const row of c.comments) {
    bounded(row.id, 180);
    if (ids.has(row.id)) throw new Error("Duplicate internal comment ID.");
    ids.add(row.id);
    bounded(row.number, 80);
    bounded(row.wording, 8000);
    bounded(row.discipline, 120, true);
    bounded(row.responsible, 200, true);
    if (typeof row.uncertain !== "boolean")
      throw new Error("Declare extraction uncertainty.");
    bindEvidence(p, row.source, true);
  }
  for (const row of c.comments)
    if (row.parentId && (!ids.has(row.parentId) || row.parentId === row.id))
      throw new Error("Invalid nested comment reference.");
  for (const row of c.comments) {
    const seen = new Set([row.id]);
    let parent = row.parentId;
    while (parent) {
      if (seen.has(parent))
        throw new Error("Nested reviewer comments contain a cycle.");
      seen.add(parent);
      parent = c.comments.find((r) => r.id === parent)?.parentId ?? null;
    }
  }
}
function change(p: AutoProject, action: string, detail: string) {
  p.version++;
  p.updatedAt = now();
  p.events.push({
    id: crypto.randomUUID(),
    type: action,
    detail,
    createdAt: p.updatedAt,
  });
  return p;
}
function reopenPackage(p: AutoProject) {
  for (const d of p.decisions)
    if (d.kind === "package" && ["pending", "approved"].includes(d.status))
      d.status = "stale";
  for (const m of p.mail)
    if (!["sent", "sending", "uncertain"].includes(m.status))
      m.status = "stale";
}
/** Models may draft this register, but only a user can confirm its completeness. */
export function proposeRegister(
  project: AutoProject,
  rows: unknown,
): AutoProject {
  if (!Array.isArray(rows) || rows.length > 150)
    throw new Error("Invalid reviewer comment list.");
  const p = structuredClone(project),
    old = p.corrections;
  const assigned = rows.map((v: Record<string, unknown>) =>
    typeof v?.id === "string" && old?.comments.some((c) => c.id === v.id)
      ? String(v.id)
      : crypto.randomUUID(),
  );
  const idMap = new Map<string, string>();
  rows.forEach((v: Record<string, unknown>, index: number) => {
    if (typeof v?.id === "string" && v.id) {
      if (idMap.has(v.id)) throw new Error("Duplicate extraction identifier.");
      idMap.set(v.id, assigned[index]);
    }
  });
  const comments: ReviewComment[] = rows.map(
    (v: Record<string, unknown>, index: number) => {
      if (!v || typeof v !== "object")
        throw new Error("Invalid reviewer comment.");
      const source = bindEvidence(p, v.source);
      const wording = bounded(v.wording, 8000);
      if (!source.quote.includes(wording))
        throw new Error(
          "Original reviewer wording must appear in its source quotation.",
        );
      const supplied = assigned[index];
      return {
        id: supplied,
        number: bounded(v.number, 80),
        wording,
        discipline: bounded(v.discipline ?? "", 120, true),
        responsible: bounded(v.responsible ?? "", 200, true),
        parentId:
          typeof v.parentId === "string"
            ? (idMap.get(v.parentId) ?? v.parentId)
            : null,
        source,
        uncertain: v.uncertain !== false,
      };
    },
  );
  const revision = (old?.revision ?? 0) + 1;
  p.corrections = {
    revision,
    confirmedRevision: null,
    comments,
    reviews: old?.reviews ?? [],
    history: [
      ...(old?.history ?? []),
      {
        at: now(),
        action: "register_drafted",
        revision,
        detail:
          "Original numbering retained. Human completeness review is required.",
      },
    ],
  };
  validateCorrectionState(p);
  reopenPackage(p);
  p.status = "needs_input";
  return change(
    p,
    "register_drafted",
    "Review the extracted register; confidence does not establish completeness.",
  );
}
export function confirmRegister(project: AutoProject, revision: number) {
  const p = structuredClone(project),
    c = p.corrections;
  if (!c || c.revision !== revision)
    throw new Error("Review the current register revision.");
  if (!c.comments.length || c.comments.some((r) => r.uncertain))
    throw new Error(
      "Resolve uncertain comments before confirming the register.",
    );
  c.confirmedRevision = revision;
  c.history.push({
    at: now(),
    action: "register_confirmed",
    revision,
    detail:
      "User confirmed this register version; unread pages remain separate.",
  });
  return change(
    p,
    "register_confirmed",
    "The user confirmed the current comment register.",
  );
}
export function responseRows(p: AutoProject): ResponseDraft[] {
  return (
    (p.artifacts.find((a) => a.kind === "preparation")?.data.responses as
      ResponseDraft[] | undefined) ?? []
  );
}
export function responseFingerprint(p: AutoProject, row: ResponseDraft) {
  const canonical = JSON.stringify({
    concept:
      row.conceptRevision === null
        ? null
        : row.conceptRevision !== undefined
          ? [
              row.conceptRevision,
              p.artifacts.find((a) => a.kind === "concept")?.revision,
            ]
          : p.artifacts.find((a) => a.kind === "preparation")?.dependsOn.concept
            ? [p.artifacts.find((a) => a.kind === "concept")?.revision]
            : null,
    comment: p.corrections?.comments
      .filter((c) => c.id === row.itemId)
      .map((c) => ({
        id: c.id,
        number: c.number,
        wording: c.wording,
        discipline: c.discipline,
        source: c.source,
      })),
    row,
    documents: row.evidence.map((e) => {
      const d = p.documents.find((d) => d.id === e.documentId);
      return [d?.id, d?.revision ?? 1, d?.sha256, d?.supersededBy ?? null];
    }),
  });
  return Array.from(sha256(new TextEncoder().encode(canonical)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function reviewResponse(
  project: AutoProject,
  commentId: string,
  supportConfirmed: boolean,
  note: string,
) {
  const p = structuredClone(project);
  if (!p.corrections?.comments.some((c) => c.id === commentId))
    throw new Error("Unknown reviewer comment.");
  const rows = responseRows(p).filter((r) => r.itemId === commentId);
  if (rows.length !== 1)
    throw new Error("Exactly one current response is required.");
  for (const ref of rows[0].evidence) bindEvidence(p, ref);
  if (supportConfirmed && !rows[0].evidence.length)
    throw new Error(
      "A source passage is required before confirming evidentiary support.",
    );
  p.corrections.reviews.push({
    commentId,
    fingerprint: responseFingerprint(p, rows[0]),
    reviewedAt: now(),
    supportConfirmed,
    note: bounded(note, 2000, true),
  });
  return change(
    p,
    "response_reviewed",
    "The user reviewed one exact response and its evidence; city acceptance is not inferred.",
  );
}
export function assessCorrections(p: AutoProject) {
  const c = p.corrections,
    rows = responseRows(p),
    issues: { code: string; commentId?: string; detail: string }[] = [];
  if (!c)
    return {
      registered: false,
      confirmed: false,
      coverage: 0,
      total: 0,
      submissionReady: false,
      issues: [],
      items: [],
    };
  if (c.confirmedRevision !== c.revision)
    issues.push({
      code: "unconfirmed_register",
      detail: "Review and confirm the extracted comment register.",
    });
  const unread = p.documents
    .filter((d) => !d.supersededBy)
    .flatMap((d) =>
      Array.from({ length: d.pages }, (_, i) => i + 1)
        .filter(
          (page) => !d.excerpts.some((e) => e.page === page && e.text.trim()),
        )
        .map((page) => ({ documentId: d.id, page })),
    );
  for (const d of p.documents.filter(
    (d) =>
      !d.supersededBy &&
      d.warnings.some((w) =>
        /excerpt budget|complete content|additional page review/i.test(w),
      ),
  ))
    issues.push({
      code: "incomplete_page_coverage",
      detail: `${d.name} contains incomplete text coverage; compare the original file before release.`,
    });
  for (const ref of unread)
    issues.push({
      code: "unread_page",
      detail: `${ref.documentId}, page ${ref.page} requires review.`,
    });
  for (const row of rows)
    if (!c.comments.some((comment) => comment.id === row.itemId))
      issues.push({
        code: "unknown_comment",
        commentId: row.itemId,
        detail:
          "Response references a comment outside the authoritative register.",
      });
  const duplicateNumbers = [...new Set(c.comments.map((c) => c.number))]
    .filter(
      (number) => c.comments.filter((c) => c.number === number).length > 1,
    )
    .map((number) => ({
      number,
      disciplines: c.comments
        .filter((c) => c.number === number)
        .map((c) => c.discipline),
    }));
  const items = c.comments.map((comment) => {
    const matched = rows.filter((row) => row.itemId === comment.id),
      draft = matched[0];
    if (!matched.length)
      issues.push({
        code: "omitted_comment",
        commentId: comment.id,
        detail: `${comment.discipline} ${comment.number} has no response.`,
      });
    if (matched.length > 1)
      issues.push({
        code: "duplicate_response",
        commentId: comment.id,
        detail: "Multiple responses reference the same internal comment.",
      });
    let valid = true;
    if (
      draft?.conceptRevision != null &&
      draft.conceptRevision !==
        p.artifacts.find((a) => a.kind === "concept")?.revision
    ) {
      valid = false;
      issues.push({
        code: "stale_concept_dependency",
        commentId: comment.id,
        detail:
          "The concept used by this response changed; reassessment is required.",
      });
    }
    if (draft)
      for (const e of draft.evidence)
        try {
          bindEvidence(p, e);
        } catch {
          valid = false;
          issues.push({
            code: "outdated_or_invalid_evidence",
            commentId: comment.id,
            detail: p.documents.find((d) => d.id === e.documentId)?.supersededBy
              ? "A cited drawing is a historical revision; reassess this response against its replacement."
              : "The source revision or quotation does not match; reassess this response.",
          });
        }
    if (draft && !draft.evidence.length)
      issues.push({
        code: "missing_evidence",
        commentId: comment.id,
        detail: "No supporting passage is linked.",
      });
    const review =
      draft &&
      c.reviews.findLast(
        (r) =>
          r.commentId === comment.id &&
          r.fingerprint === responseFingerprint(p, draft),
      );
    const reviewed = !!review && valid && matched.length === 1,
      supported =
        reviewed && review.supportConfirmed && !!draft?.evidence.length;
    if (draft && !reviewed)
      issues.push({
        code: "unreviewed_response",
        commentId: comment.id,
        detail: "A person must review this response version.",
      });
    return {
      comment,
      draft,
      accountedFor: matched.length === 1,
      drafted: !!draft?.response?.trim(),
      evidenceCurrent: valid && !!draft?.evidence.length,
      reviewed,
      supported,
      cityAccepted: false,
      unresolved: draft?.missing ?? [],
    };
  });
  const coverage = items.filter((i) => i.accountedFor).length;
  return {
    registered: true,
    confirmed: c.confirmedRevision === c.revision,
    coverage,
    total: c.comments.length,
    duplicateNumbers,
    unreadPages: unread,
    items,
    issues,
    submissionReady: false,
    responseSetReviewed:
      !!items.length &&
      c.confirmedRevision === c.revision &&
      !unread.length &&
      !issues.some((i) => i.code === "incomplete_page_coverage") &&
      !issues.some((i) =>
        [
          "unknown_comment",
          "duplicate_response",
          "outdated_or_invalid_evidence",
        ].includes(i.code),
      ) &&
      items.every(
        (i) => i.drafted && i.reviewed && i.supported && !i.unresolved.length,
      ),
  };
}
export function replaceDocument(
  project: AutoProject,
  oldId: string,
  newId: string,
) {
  const p = structuredClone(project),
    old = p.documents.find((d) => d.id === oldId),
    next = p.documents.find((d) => d.id === newId);
  if (
    !old ||
    !next ||
    old === next ||
    old.supersededBy ||
    next.supersededBy ||
    next.seriesId ||
    p.corrections?.comments.some((c) => c.source.documentId === newId) ||
    responseRows(p).some((r) => r.evidence.some((e) => e.documentId === newId))
  )
    throw new Error(
      "Choose a current source and a fresh uploaded replacement.",
    );
  old.supersededBy = next.id;
  next.seriesId = old.seriesId ?? old.id;
  next.revision = (old.revision ?? 1) + 1;
  reopenPackage(p);
  p.stage = "preparation";
  p.status = "running";
  if (p.corrections?.comments.some((c) => c.source.documentId === oldId)) {
    p.corrections.confirmedRevision = null;
    p.stage = "understanding";
  }
  return change(
    p,
    "source_replaced",
    `Document revision ${old.revision ?? 1} replaced by ${next.revision}. Historical evidence is retained; affected response reviews require renewal.`,
  );
}
