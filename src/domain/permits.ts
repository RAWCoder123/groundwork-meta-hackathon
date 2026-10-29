import type { Answer, PermitAssessment, PermitCase, PermitDocument, PermitEvidence, PermitItem, PermitProposal, PermitSource } from "./permit-types";

const city = "https://www.portland.gov";
export const PERMIT_SOURCES: PermitSource[] = [
  { id: "corrections", title: "Prepare and submit checksheet corrections", url: city + "/ppd/get-permit/checksheets", section: "Single PDF corrections", accessed: "2026-10-29", note: "Answer every reviewer item and identify the plan location. Standard Single PDF corrections use changed plan pages; FPP has a different process." },
  { id: "devhub", title: "Upload corrections in DevHub", url: city + "/ppd/upload-corrections-devhub", section: "Upload availability and authorization", accessed: "2026-10-29", note: "Observe completed-review/upload status. A technician-authorized Request to Upload is a separate exception; this app does not submit to DevHub." },
  { id: "requirements", title: "Commercial permit application requirements", url: city + "/ppd/commercial-permitting/commercial-requirements", section: "Alterations and scope-dependent submittals", accessed: "2026-10-29", note: "Required plans and supplemental documents depend on project scope. Document presence does not prove compliance." },
  { id: "alterations", title: "Commercial tenant improvements and alterations", url: city + "/ppd/commercial-permitting/commercial-permit-inspections/commercial-tenant-improvement-alteration", section: "Research existing legal conditions; permit process", accessed: "2026-10-29", note: "Research final permitted conditions and resolve trade permits, fees, and inspections with the responsible parties." },
  { id: "plans", title: "Create detailed commercial plans", url: city + "/ppd/commercial-permitting/changing-commercial-space/prepare/create-detailed-plans", section: "Plan preparation and professional review", accessed: "2026-10-29", note: "Commercial drawings and professional licensing requirements require scope-specific review. This register contains excerpts, not checked or stamped drawings." },
  { id: "edition", title: "2025 Oregon commercial code transition", url: city + "/ppd/commercial-permitting/news/2025/9/1/new-2025-oregon-structural-specialty-code-and-oregon", section: "Code edition and application date", accessed: "2026-10-29", note: "New commercial building/mechanical applications from April 1, 2026 use the 2025 OSSC/OMSC. Confirm the actual permit's applicable edition; older permits may differ." },
];

type RecordValue = Record<string, unknown>;
function record(value: unknown, keys: string[], label: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const obj = value as RecordValue;
  if (Object.keys(obj).some(key => !keys.includes(key))) throw new Error(`${label} has unsupported fields.`);
  if (keys.some(key => !Object.hasOwn(obj, key))) throw new Error(`${label} is missing a field.`);
  return obj;
}
function string(value: unknown, label: string, max: number, empty = false): string {
  if (typeof value !== "string" || value.length > max || (!empty && !value.trim())) throw new Error(`${label} is missing or too long.`);
  return value;
}
function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 1_000_000) throw new Error(`${label} must be a valid positive revision.`);
  return value;
}
function answer(value: unknown, label: string): Answer {
  if (value !== "yes" && value !== "no" && value !== "unknown") throw new Error(`${label} must be yes, no or unknown.`);
  return value;
}
function list(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} exceeds the supported limit.`);
  return value;
}
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must have unique IDs.`);
}
function evidence(value: unknown): PermitEvidence {
  const e = record(value, ["documentId", "revision", "sheet", "quote"], "Evidence reference");
  return { documentId: string(e.documentId, "Document ID", 80), revision: string(e.revision, "Document revision", 80), sheet: string(e.sheet, "Sheet", 80), quote: string(e.quote, "Evidence quote", 2000) };
}
function document(value: unknown): PermitDocument {
  const d = record(value, ["id", "name", "revision", "excerpt"], "Document excerpt");
  return { id: string(d.id, "Document ID", 80), name: string(d.name, "Document name", 160), revision: string(d.revision, "Document revision", 80), excerpt: string(d.excerpt, "Document excerpt", 10000, true) };
}
function item(value: unknown): PermitItem {
  const i = record(value, ["id", "quote", "discipline", "owner", "response", "evidence", "approved"], "Checksheet item");
  if (typeof i.approved !== "boolean") throw new Error("Review approval must be true or false.");
  return { id: string(i.id, "Item ID", 80), quote: string(i.quote, "Reviewer comment", 4000), discipline: string(i.discipline, "Discipline", 100), owner: string(i.owner, "Owner", 160, true), response: string(i.response, "Draft response", 4000, true), evidence: list(i.evidence, "Evidence references", 4).map(evidence), approved: i.approved };
}
export function validatePermitCase(value: unknown): PermitCase {
  const p = record(value, ["schemaVersion", "revision", "name", "jurisdiction", "workflow", "sameUse", "structuralWork", "exteriorWork", "specialUse", "existingPermitVerified", "codeEditionConfirmed", "allReviewsComplete", "uploadAuthorized", "documents", "items"], "Permit case");
  if (p.schemaVersion !== 1) throw new Error("Unsupported permit case version.");
  const documents = list(p.documents, "Documents", 8).map(document);
  const items = list(p.items, "Checksheet items", 20).map(item);
  unique(documents.map(d => d.id), "Documents"); unique(items.map(i => i.id), "Checksheet items");
  if (documents.reduce((sum, d) => sum + d.excerpt.length, 0) > 40000) throw new Error("Combined document excerpts exceed 40000 characters.");
  return {
    schemaVersion: 1, revision: integer(p.revision, "Case revision"), name: string(p.name, "Case name", 160), jurisdiction: string(p.jurisdiction, "Jurisdiction", 80), workflow: string(p.workflow, "Workflow", 80),
    sameUse: answer(p.sameUse, "Same use"), structuralWork: answer(p.structuralWork, "Structural work"), exteriorWork: answer(p.exteriorWork, "Exterior work"), specialUse: answer(p.specialUse, "Special use"), existingPermitVerified: answer(p.existingPermitVerified, "Existing legal permit history"), codeEditionConfirmed: answer(p.codeEditionConfirmed, "Code edition"), allReviewsComplete: answer(p.allReviewsComplete, "Review completion"), uploadAuthorized: answer(p.uploadAuthorized, "Technician upload authorization"), documents, items,
  };
}

export function makePermitCase(): PermitCase {
  return {
    schemaVersion: 1, revision: 1, name: "Cedar office · correction round 1", jurisdiction: "portland-or", workflow: "standard-single-pdf",
    sameUse: "yes", structuralWork: "no", exteriorWork: "no", specialUse: "no", existingPermitVerified: "unknown", codeEditionConfirmed: "unknown", allReviewsComplete: "yes", uploadAuthorized: "unknown",
    documents: [
      { id: "plan-a101", name: "A101 proposed plan excerpt · fictional", revision: "R2", excerpt: "Sheet A101 — Revision R2. Existing partitions remain solid; demolished partitions are dashed; proposed non-load-bearing partitions are hatched. Construction scope is confined to the office interior. This is a fictional text excerpt, not an approved construction drawing." },
      { id: "plan-a102", name: "A102 route detail excerpt · fictional", revision: "R2", excerpt: "Sheet A102 — Revision R2. The proposed accessible route and door maneuvering clearances are dimensioned for architect review. The actual dimensions and technical compliance are not established by this fictional text excerpt." },
    ],
    items: [
      { id: "LS-1", quote: "Show existing, demolition and proposed partitions on sheet A101.", discipline: "Architectural", owner: "Architect", response: "", evidence: [], approved: false },
      { id: "LS-2", quote: "Identify the accessible route and door maneuvering clearances on sheet A102.", discipline: "Architectural", owner: "Architect", response: "", evidence: [], approved: false },
      { id: "FA-1", quote: "Provide fire alarm coordination documentation for the proposed partition changes.", discipline: "Fire / MEP", owner: "Fire protection designer", response: "", evidence: [], approved: false },
    ],
  };
}

function evidenceIssues(ref: PermitEvidence, documents: PermitDocument[]): string[] {
  const doc = documents.find(d => d.id === ref.documentId);
  if (!doc) return [`Referenced document ${ref.documentId} is not in the register.`];
  const issues: string[] = [];
  if (ref.revision !== doc.revision) issues.push(`Reference to ${doc.name} uses stale revision ${ref.revision}; current revision is ${doc.revision}.`);
  if (!ref.sheet.trim() || !doc.excerpt.includes(ref.sheet)) issues.push(`Sheet ${ref.sheet} is not identified in the registered excerpt.`);
  if (!ref.quote.trim() || !doc.excerpt.includes(ref.quote)) issues.push(`Quoted evidence is not present in ${doc.name}.`);
  return issues;
}
export function assessPermitCase(input: PermitCase): PermitAssessment {
  const p = validatePermitCase(input);
  const blockers: PermitAssessment["blockers"] = [];
  const add = (id: string, title: string, detail: string, sourceId: string) => blockers.push({ id, title, detail, sourceId });
  if (p.jurisdiction !== "portland-or") add("jurisdiction", "Unsupported jurisdiction", "This workflow supports Portland, Oregon only.", "requirements");
  if (p.workflow !== "standard-single-pdf") add("workflow", "Unsupported submission path", "Only standard Single PDF corrections are supported. Facility Permit Program corrections require a separate process, including complete replacement plan sets.", "corrections");
  const scope: [keyof PermitCase, Answer, string][] = [["sameUse", "yes", "Existing legal office use must remain unchanged."], ["structuralWork", "no", "Structural work requires a different technical workflow."], ["exteriorWork", "no", "Exterior work and additions are outside this pilot."], ["specialUse", "no", "Food, medical, hazardous and other specialized uses are outside this pilot."]];
  for (const [key, expected, detail] of scope) if (p[key] !== expected) add(String(key), "Scope needs review", detail + (p[key] === "unknown" ? " This fact is unknown." : " The declared scope is outside the pilot."), "alterations");
  const scopeSupported = blockers.length === 0;
  if (p.existingPermitVerified !== "yes") add("history", "Existing legal conditions unverified", "Confirm approved final permit records and existing office use with the responsible professional; a tenant description alone is insufficient.", "alterations");
  if (p.codeEditionConfirmed !== "yes") add("edition", "Code edition needs confirmation", "Confirm the edition applicable to this permit and its application date. Do not substitute residential or older commercial assumptions.", "edition");
  if (p.allReviewsComplete !== "yes" && p.uploadAuthorized !== "yes") add("upload", "Upload timing not established", "Wait for all reviews to complete or obtain explicit technician authorization to upload. This app cannot infer DevHub upload permission.", "devhub");
  if (!p.items.length) add("empty", "No reviewer items recorded", "Record and verify every item from every checksheet. An empty list is not a completed correction round.", "corrections");
  const items = p.items.map(i => {
    const issues: string[] = [];
    if (!i.owner.trim()) issues.push("Assign a responsible owner.");
    if (!i.response.trim()) issues.push("Draft a response to the reviewer item.");
    if (!i.evidence.length) issues.push("Link current drawing or reference evidence; drafting text alone does not resolve the work.");
    for (const ref of i.evidence) issues.push(...evidenceIssues(ref, p.documents));
    if (!i.approved) issues.push("Applicant review of this response and its evidence is pending.");
    if (issues.length) add(`item-${i.id}`, `${i.id} is incomplete`, issues.join(" "), "corrections");
    return { id: i.id, ready: issues.length === 0, issues };
  });
  return { scopeSupported, readyForHandoff: blockers.length === 0, blockers, items };
}

export function applyPermitProposal(input: PermitCase, value: PermitProposal): PermitCase {
  const p = validatePermitCase(input);
  const proposal = record(value, ["baseRevision", "updates"], "Permit proposal");
  if (integer(proposal.baseRevision, "Proposal revision") !== p.revision) throw new Error("The case changed. Generate a new proposal for the current revision.");
  const updates = list(proposal.updates, "Proposed updates", 20).map(raw => {
    const u = record(raw, ["id", "owner", "response", "evidence"], "Proposed update");
    const id = string(u.id, "Item ID", 80);
    if (!p.items.some(i => i.id === id)) throw new Error("A proposed item does not exist in this checksheet.");
    const refs = list(u.evidence, "Evidence references", 4).map(evidence);
    for (const ref of refs) if (evidenceIssues(ref, p.documents).length) throw new Error("The proposal contains an unverified quotation, sheet or document revision.");
    return { id, owner: string(u.owner, "Owner", 160, true), response: string(u.response, "Draft response", 4000, true), evidence: refs };
  });
  if (!updates.length) throw new Error("The proposal contains no updates.");
  unique(updates.map(u => u.id), "Proposed updates");
  const items = p.items.map(i => {
    const update = updates.find(u => u.id === i.id);
    return update ? { ...i, owner: update.owner, response: update.response, evidence: update.evidence, approved: false } : { ...i, evidence: i.evidence.map(e => ({ ...e })) };
  });
  return validatePermitCase({ ...p, revision: p.revision + 1, items });
}
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
export function buildPermitPacket(input: PermitCase): string {
  const p = validatePermitCase(input), a = assessPermitCase(p);
  const status = a.readyForHandoff ? "Prepared for applicant handoff" : "INCOMPLETE — coordination work remains";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(p.name)} — Schema review packet</title><style>body{font:15px/1.6 system-ui,sans-serif;color:#25302b;max-width:960px;margin:40px auto;padding:0 24px}h1,h2,h3{line-height:1.2}h2{margin-top:36px}.status{border:2px solid #7b6340;padding:18px;background:#fbf7ed}section{break-inside:avoid;border-top:1px solid #ddd;padding:15px 0}blockquote{margin:12px 0;padding:8px 15px;border-left:3px solid #b5bcad;white-space:pre-wrap}.meta{color:#657064;font-size:13px}a{color:#3c553e}pre{white-space:pre-wrap;font:inherit}li{margin-bottom:8px}@media print{body{margin:0;max-width:none}button{display:none}}</style></head><body><p class="meta">SCHEMA · COMMERCIAL CORRECTIONS COORDINATION · CASE REVISION ${p.revision}</p><h1>${escape(p.name)}</h1><div class="status"><strong>${status}</strong><p>This is a review handoff, not a permit application package, code certification, municipal approval or proof of a DevHub submission. Human review is required. Sources and document excerpts do not establish that drawings satisfy technical requirements.</p></div><p>Supported pilot: Portland, Oregon · standard Single PDF · existing office use · interior nonstructural tenant improvement. FPP, additions and specialized uses are excluded.</p><h2>Outstanding work</h2>${a.blockers.length ? `<ul>${a.blockers.map(b => `<li><strong>${escape(b.title)}</strong> — ${escape(b.detail)} <a href="#source-${escape(b.sourceId)}">Source</a></li>`).join("")}</ul>` : "<p>All recorded coordination gates are satisfied. The applicant must still verify issue coverage, plans, signatures, technical requirements and current portal instructions.</p>"}<h2>Response matrix</h2>${p.items.map(i => `<section><h3>${escape(i.id)} · ${escape(i.discipline)}</h3><p class="meta">Owner: ${escape(i.owner || "Unassigned")} · ${i.approved ? "Applicant reviewed" : "Review pending"} · ${a.items.find(result => result.id === i.id)?.ready ? "Recorded item prepared" : "Incomplete"}</p><h4>Reviewer item</h4><blockquote>${escape(i.quote)}</blockquote><h4>Draft response</h4><pre>${escape(i.response || "No response drafted.")}</pre><h4>Registered evidence</h4>${i.evidence.length ? i.evidence.map(e => `<p>${escape(e.documentId)} · revision ${escape(e.revision)} · sheet ${escape(e.sheet)}</p><blockquote>${escape(e.quote)}</blockquote>`).join("") : "<p>Missing. The responsible designer must supply the actual work and evidence.</p>"}</section>`).join("")}<h2>Document excerpt register</h2><p>These are registered text excerpts, not uploaded, checked or stamped drawing files. The actual PDFs must be prepared and reviewed separately.</p>${p.documents.map(d => `<section><h3>${escape(d.name)}</h3><p class="meta">ID ${escape(d.id)} · revision ${escape(d.revision)}</p><blockquote>${escape(d.excerpt)}</blockquote></section>`).join("")}<h2>Applicant's next steps</h2><ol><li>Check every item on every reviewer checksheet against the response matrix. Unrecorded items cannot be detected by this app.</li><li>Have responsible professionals complete and review the underlying drawings and technical work.</li><li>For standard Single PDF corrections, follow the City's changed-page instructions, include reviewer checksheets, responses and applicable supporting documents; preserve sheet sizes and requested date stamps. Do not reuse these instructions for FPP.</li><li>Confirm completed reviews or explicit technician upload permission and follow current DevHub instructions. The applicant performs the actual upload, authorization and submission. Permits, fees, issuance and inspections remain separate steps.</li></ol><h2>Declared case facts</h2><ul>${(["jurisdiction", "workflow", "sameUse", "structuralWork", "exteriorWork", "specialUse", "existingPermitVerified", "codeEditionConfirmed", "allReviewsComplete", "uploadAuthorized"] as const).map(key => `<li>${escape(key)}: ${escape(p[key])}</li>`).join("")}</ul><h2>Source record</h2>${PERMIT_SOURCES.map(s => `<section id="source-${escape(s.id)}"><h3><a href="${escape(s.url)}">${escape(s.title)}</a></h3><p>${escape(s.section)} · accessed ${escape(s.accessed)}</p><p>${escape(s.note)}</p></section>`).join("")}<p class="meta">Schema tracks the recorded case only. Applicant confirmation does not bind the City or establish legal compliance.</p></body></html>`;
}
