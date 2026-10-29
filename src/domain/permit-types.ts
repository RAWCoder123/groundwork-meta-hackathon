export type Answer = "yes" | "no" | "unknown";
export type PermitDocument = { id: string; name: string; revision: string; excerpt: string };
export type PermitEvidence = { documentId: string; revision: string; sheet: string; quote: string };
export type PermitItem = {
  id: string; quote: string; discipline: string; owner: string; response: string;
  evidence: PermitEvidence[]; approved: boolean;
};
export type PermitCase = {
  schemaVersion: 1; revision: number; name: string; jurisdiction: string; workflow: string;
  sameUse: Answer; structuralWork: Answer; exteriorWork: Answer; specialUse: Answer;
  existingPermitVerified: Answer; codeEditionConfirmed: Answer;
  allReviewsComplete: Answer; uploadAuthorized: Answer;
  documents: PermitDocument[]; items: PermitItem[];
};
export type PermitFinding = { id: string; title: string; detail: string; sourceId: string };
export type PermitAssessment = {
  scopeSupported: boolean; readyForHandoff: boolean;
  blockers: PermitFinding[];
  items: { id: string; ready: boolean; issues: string[] }[];
};
export type PermitProposal = {
  baseRevision: number;
  updates: { id: string; owner: string; response: string; evidence: PermitEvidence[] }[];
};
export type PermitAgentResult = {
  mode: "meta"; model: string; message: string; proposal: PermitProposal | null;
  steps: {tool: string; detail: string}[];
};
export type PermitSource = { id: string; title: string; url: string; section: string; accessed: string; note: string };
