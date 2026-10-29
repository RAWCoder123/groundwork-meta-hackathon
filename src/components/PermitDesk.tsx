import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, CircleAlert, ClipboardList, Download, FileCheck2, FileText, Link2, LoaderCircle, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { applyPermitProposal, assessPermitCase, buildPermitPacket, makePermitCase, PERMIT_SOURCES, validatePermitCase } from "../domain/permits";
import type { Answer, PermitAgentResult, PermitCase, PermitEvidence, PermitItem } from "../domain/permit-types";
import "../permit-desk.css";

const STORAGE = "schema.permit.v1";
type Section = "responses" | "documents" | "scope" | "sources";
const answers: Answer[] = ["unknown", "yes", "no"];
const fields: { key: keyof Pick<PermitCase, "sameUse" | "structuralWork" | "exteriorWork" | "specialUse" | "existingPermitVerified" | "codeEditionConfirmed" | "allReviewsComplete" | "uploadAuthorized">; label: string; help: string }[] = [
  { key: "sameUse", label: "Existing office use stays the same", help: "A use or occupancy change needs a different assessment." },
  { key: "structuralWork", label: "Structural work is included", help: "Structural design is outside this case workflow." },
  { key: "exteriorWork", label: "Exterior work or an addition is included", help: "This starter case covers interior work only." },
  { key: "specialUse", label: "Food, medical, or hazardous use is involved", help: "These projects require additional specialist review." },
  { key: "existingPermitVerified", label: "Legal existing conditions have been verified", help: "Confirm through final approved permit records; a current layout alone is insufficient." },
  { key: "codeEditionConfirmed", label: "Applicable code edition is confirmed", help: "New commercial applications from April 1, 2026 use the 2025 OSSC/OMSC. Older permits can differ." },
  { key: "allReviewsComplete", label: "All city reviews are complete", help: "Wait for all reviews before standard corrections upload." },
  { key: "uploadAuthorized", label: "Technician explicitly authorized an earlier upload", help: "Use only when permission has actually been given. This is not inferred by the agent." },
];
function initialCase(): PermitCase {
  try { const value = localStorage.getItem(STORAGE); if (value) return validatePermitCase(JSON.parse(value)); } catch {}
  return makePermitCase();
}
function saveDownload(name: string, body: string, mime: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function shortError(error: unknown) { return error instanceof Error ? error.message : "That action could not be completed."; }

export function PermitDesk({ apiKey, connected, onConnect }: { apiKey: string; connected: boolean; onConnect: () => void }) {
  const [file, setFile] = useState(initialCase);
  const [section, setSection] = useState<Section>("responses");
  const [result, setResult] = useState<PermitAgentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [instruction, setInstruction] = useState("Inspect every reviewer comment, check the available evidence, and draft coordinated responses. Keep missing drawing work unresolved.");
  const fileRef = useRef(file);
  const requestRef = useRef<AbortController | null>(null);
  const nextId = useRef(0);
  const checked = useMemo(() => {
    try { const valid = validatePermitCase(file); return { assessment: assessPermitCase(valid), error: "" }; }
    catch (cause) { return { assessment: null, error: shortError(cause) }; }
  }, [file]);
  const assessment = checked.assessment;
  const readyCount = assessment?.items.filter(item => item.ready).length || 0;
  const pendingCount = Math.max(0, file.items.length - readyCount);
  useEffect(() => {
    fileRef.current = file;
    try { localStorage.setItem(STORAGE, JSON.stringify(validatePermitCase(file))); } catch {}
  }, [file]);
  useEffect(() => () => requestRef.current?.abort(), []);

  function change(update: (draft: PermitCase) => void, resetApprovals = true) {
    const next = structuredClone(fileRef.current);
    update(next); next.revision++;
    if (resetApprovals) next.items.forEach(item => { item.approved = false; });
    fileRef.current = next; setFile(next); setNotice(""); setError("");
  }
  function editItem(id: string, update: (item: PermitItem) => void, resetAll = true) {
    change(draft => { const item = draft.items.find(candidate => candidate.id === id); if (item) { update(item); item.approved = false; } }, resetAll);
  }
  function editEvidence(id: string, index: number, patch: Partial<PermitEvidence>) {
    editItem(id, item => { item.evidence[index] = { ...item.evidence[index], ...patch }; });
  }
  function exportPacket() {
    try {
      const current = validatePermitCase(fileRef.current);
      saveDownload("schema-commercial-correction-draft.html", buildPermitPacket(current), "text/html;charset=utf-8");
      setNotice("Response coordination draft exported. Drawing files and city submission are separate."); setError("");
    } catch (cause) { setError(shortError(cause)); }
  }
  async function runAgent() {
    if (!connected) { onConnect(); return; }
    let snapshot: PermitCase;
    try { snapshot = validatePermitCase(fileRef.current); } catch (cause) { setError(shortError(cause)); return; }
    if (!instruction.trim()) { setError("Describe what you want the agent to coordinate."); return; }
    const controller = new AbortController(); requestRef.current = controller;
    setBusy(true); setResult(null); setError(""); setNotice("");
    try {
      const response = await fetch("/api/permits", { method: "POST", headers: { "content-type": "application/json", ...(apiKey ? { "x-meta-api-key": apiKey } : {}) }, body: JSON.stringify({ case: snapshot, message: instruction.trim() }), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Meta could not complete this request.");
      if (data.mode !== "meta" || !Array.isArray(data.steps) || typeof data.message !== "string") throw new Error("The agent returned an unsupported response.");
      if (fileRef.current.revision !== snapshot.revision) { setNotice("The case changed during the request. Run the agent again against the current revision."); return; }
      if (data.proposal) applyPermitProposal(snapshot, data.proposal);
      setResult(data as PermitAgentResult);
    } catch (cause) { if (!controller.signal.aborted) setError(shortError(cause)); }
    finally { if (requestRef.current === controller) { requestRef.current = null; setBusy(false); } }
  }
  function applyDrafts() {
    if (!result?.proposal) return;
    try {
      const next = applyPermitProposal(fileRef.current, result.proposal);
      fileRef.current = next; setFile(next); setResult(null);
      setNotice("Draft responses applied. Review the evidence and approve each item yourself."); setError("");
    } catch (cause) { setError(shortError(cause)); }
  }
  function resetSample() {
    const next = makePermitCase(); next.revision = fileRef.current.revision + 1;
    fileRef.current = next; setFile(next); setResult(null); setError("");
    setNotice("Fictional office case restored.");
  }

  return <div className="permit-desk">
    <div className="permit-heading">
      <div><div className="permit-eyebrow"><ClipboardList size={14} /> Commercial construction · Portland, Oregon</div><h1>Move the review forward.</h1><p>Every reviewer comment, a clear owner, and the evidence behind the response.</p></div>
      <div className="permit-heading-actions"><button className="button" onClick={resetSample}><RotateCcw size={14} /> Restore sample</button><button className="button primary" onClick={exportPacket}><Download size={15} /> Export response draft</button></div>
    </div>
    <div className="permit-case-strip">
      <div className="permit-case-title"><span className="permit-sample-tag">Fictional case</span><strong>{file.name}</strong><span>Office tenant improvement · revision {file.revision}</span></div>
      <div className="permit-case-metrics"><span><b>{file.items.length}</b> review items</span><span><b>{readyCount}</b> reviewed with evidence</span><span className={pendingCount ? "permit-warning-text" : ""}><b>{pendingCount}</b> still open</span></div>
    </div>
    <ol className="permit-timeline" aria-label="Permit workflow"><li>Research & intake</li><li>City review</li><li aria-current="step">Corrections <span>Current workspace</span></li><li>Applicant handoff</li><li>City issuance & inspections</li></ol>
    <div className="permit-layout">
      <section className="permit-workbench">
        <nav className="permit-tabs" aria-label="Permit case sections">{([ ["responses", "Response matrix"], ["documents", "Plan excerpts"], ["scope", "Case scope"], ["sources", "City guidance"] ] as const).map(([id, label]) => <button key={id} className={section === id ? "selected" : ""} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}>{label}{id === "documents" && <span>{file.documents.length}</span>}</button>)}</nav>
        <div className="permit-section-body">
          {checked.error && <div className="permit-alert" role="alert"><CircleAlert size={17} /><p>Complete the current fields before exporting or sending to Meta: {checked.error}</p></div>}
          {notice && <div className="permit-notice" role="status"><Check size={16} />{notice}</div>}
          {error && <div className="permit-alert" role="alert"><CircleAlert size={17} /><p>{error}</p></div>}
          {section === "responses" && <>
            <div className="permit-section-intro"><div><h2>Reviewer comments → coordinated responses</h2><p>Drafting a response does not resolve an issue. Check every checksheet item is recorded; only registered items are assessed.</p></div><button className="button" disabled={file.items.length >= 20} onClick={() => change(draft => { draft.items.push({ id: `C-${Date.now()}-${++nextId.current}`, quote: "New reviewer comment — replace with the exact text.", discipline: "Applicant", owner: "", response: "", evidence: [], approved: false }); })}><Plus size={14} /> Add comment</button></div>
            {file.items.length === 0 && <div className="permit-empty">Add the exact text of each numbered reviewer comment to start a response matrix.</div>}
            {file.items.map((item, index) => {
              const status = assessment?.items.find(value => value.id === item.id);
              return <article className="permit-review-item" key={item.id}>
                <div className="permit-item-head"><span className="permit-item-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{item.id}</strong><span>{item.discipline}</span></div><span className={`permit-status ${status?.ready ? "ready" : "open"}`}>{status?.ready ? <><Check size={12} /> Reviewed with evidence</> : <><CircleAlert size={12} /> Open</>}</span><button className="permit-icon-button" aria-label={`Remove comment ${item.id}`} onClick={() => change(draft => { draft.items = draft.items.filter(value => value.id !== item.id); })}><Trash2 size={14} /></button></div>
                <label className="permit-field">Reviewer item number<input aria-label={`Reviewer item number ${item.id}`} maxLength={80} defaultValue={item.id} onBlur={event => {
                  const id = event.target.value.trim();
                  if (id === item.id) return;
                  if (!id || fileRef.current.items.some(value => value.id === id && value.id !== item.id)) {
                    setError("Reviewer item numbers must be nonempty and unique. The original number has been kept.");
                    event.target.value = item.id;
                    return;
                  }
                  editItem(item.id, value => { value.id = id; });
                }} /></label>
                <label className="permit-field">Reviewer’s exact comment<textarea aria-label={`Reviewer comment ${item.id}`} rows={2} maxLength={4000} value={item.quote} onChange={event => editItem(item.id, value => { value.quote = event.target.value; }, true)} /></label>
                <div className="permit-two-fields"><label className="permit-field">Review discipline<input aria-label={`Discipline ${item.id}`} maxLength={80} value={item.discipline} onChange={event => editItem(item.id, value => { value.discipline = event.target.value; })} /></label><label className="permit-field">Responsible owner<input aria-label={`Owner ${item.id}`} maxLength={160} placeholder="e.g. Project architect" value={item.owner} onChange={event => editItem(item.id, value => { value.owner = event.target.value; })} /></label></div>
                <label className="permit-field">Proposed response<textarea aria-label={`Response ${item.id}`} rows={3} maxLength={4000} value={item.response} placeholder="Describe the proposed response and where the reviewer can find the revision." onChange={event => editItem(item.id, value => { value.response = event.target.value; })} /></label>
                <div className="permit-evidence-heading"><strong><Link2 size={13} /> Current evidence</strong><button disabled={item.evidence.length >= 4 || !file.documents.length} onClick={() => editItem(item.id, value => { const doc = file.documents[0]; value.evidence.push({ documentId: doc.id, revision: doc.revision, sheet: "", quote: "" }); })}><Plus size={12} /> Link excerpt</button></div>
                {item.evidence.length === 0 && <p className="permit-missing-evidence">No evidence linked. A draft response alone will stay open.</p>}
                {item.evidence.map((evidence, evidenceIndex) => <div className="permit-evidence-editor" key={evidenceIndex}>
                  <div className="permit-evidence-grid"><label className="permit-field">Document<select aria-label={`Evidence document ${item.id} ${evidenceIndex + 1}`} value={evidence.documentId} onChange={event => { const doc = file.documents.find(value => value.id === event.target.value); if (doc) editEvidence(item.id, evidenceIndex, { documentId: doc.id, revision: doc.revision, quote: "" }); }}><option value="">Choose excerpt</option>{file.documents.map(doc => <option value={doc.id} key={doc.id}>{doc.name}</option>)}</select></label><label className="permit-field">Revision<input aria-label={`Evidence revision ${item.id} ${evidenceIndex + 1}`} maxLength={80} value={evidence.revision} onChange={event => editEvidence(item.id, evidenceIndex, { revision: event.target.value })} /></label><label className="permit-field">Sheet / location<input aria-label={`Evidence sheet ${item.id} ${evidenceIndex + 1}`} maxLength={80} placeholder="A102, note 4" value={evidence.sheet} onChange={event => editEvidence(item.id, evidenceIndex, { sheet: event.target.value })} /></label><button className="permit-icon-button" aria-label={`Remove evidence ${item.id} ${evidenceIndex + 1}`} onClick={() => editItem(item.id, value => { value.evidence.splice(evidenceIndex, 1); })}><X size={14} /></button></div>
                  <label className="permit-field">Exact supporting text from the registered excerpt<textarea aria-label={`Evidence quote ${item.id} ${evidenceIndex + 1}`} rows={2} maxLength={2000} placeholder="Paste the exact supporting text; references are checked against the excerpt register." value={evidence.quote} onChange={event => editEvidence(item.id, evidenceIndex, { quote: event.target.value })} /></label>
                </div>)}
                {status && status.issues.length > 0 && <ul className="permit-item-issues">{status.issues.map((issue, issueIndex) => <li key={issueIndex}>{issue}</li>)}</ul>}
                <label className="permit-approval"><input type="checkbox" aria-label={`Reviewed response and evidence ${item.id}`} checked={item.approved} onChange={event => change(draft => { const current = draft.items.find(value => value.id === item.id); if (current) current.approved = event.target.checked; }, false)} /><span>I reviewed this response and its current evidence.<small>This records applicant review, not city acceptance or code certification.</small></span></label>
              </article>;
            })}
          </>}
          {section === "documents" && <>
            <div className="permit-section-intro"><div><h2>Evidence starts with a current reference.</h2><p>Register short text excerpts from your plans. These are not full drawing uploads or a geometry review.</p></div><button className="button" disabled={file.documents.length >= 8} onClick={() => change(draft => { draft.documents.push({ id: `D-${Date.now()}-${++nextId.current}`, name: "New plan excerpt", revision: "R1", excerpt: "Replace with an exact plan excerpt and its sheet label." }); })}><Plus size={14} /> Add excerpt</button></div>
            <div className="permit-neutral-note"><FileText size={17} /><p>Names, sheet numbers, and text are supplied by the applicant. Schema checks matching quotations and revisions; a professional must verify the actual drawing. Updating the register clears applicant approvals.</p></div>
            {file.documents.map(doc => <article className="permit-document" key={doc.id}><div className="permit-document-heading"><FileText size={18} /><strong>{doc.id}</strong><button className="permit-icon-button" aria-label={`Remove document ${doc.id}`} onClick={() => change(draft => { draft.documents = draft.documents.filter(value => value.id !== doc.id); })}><Trash2 size={15} /></button></div><div className="permit-two-fields"><label className="permit-field">Document name<input aria-label={`Document name ${doc.id}`} maxLength={160} value={doc.name} onChange={event => change(draft => { draft.documents.find(value => value.id === doc.id)!.name = event.target.value; })} /></label><label className="permit-field">Current revision<input aria-label={`Document revision ${doc.id}`} maxLength={80} value={doc.revision} onChange={event => change(draft => { draft.documents.find(value => value.id === doc.id)!.revision = event.target.value; })} /></label></div><label className="permit-field">Exact text excerpt<textarea aria-label={`Document excerpt ${doc.id}`} rows={6} maxLength={8000} value={doc.excerpt} onChange={event => change(draft => { draft.documents.find(value => value.id === doc.id)!.excerpt = event.target.value; })} /></label></article>)}
          </>}
          {section === "scope" && <>
            <div className="permit-section-intro"><div><h2>One defined commercial workflow.</h2><p>Standard Single PDF corrections for an existing office, interior nonstructural work, and unchanged use.</p></div></div>
            <div className="permit-two-fields"><label className="permit-field">Case name<input aria-label="Commercial case name" maxLength={160} value={file.name} onChange={event => change(draft => { draft.name = event.target.value; })} /></label><label className="permit-field">Jurisdiction<select value={file.jurisdiction} onChange={event => change(draft => { draft.jurisdiction = event.target.value; })}><option value="portland-or">Portland, Oregon</option><option value="other">Another jurisdiction — not supported</option></select></label></div>
            <label className="permit-field">Review program<select value={file.workflow} onChange={event => change(draft => { draft.workflow = event.target.value; })}><option value="standard-single-pdf">Standard Single PDF corrections</option><option value="fpp">Facility Permit Program — different instructions</option><option value="other">Another program — not supported</option></select></label>
            <div className="permit-scope-fields">{fields.map(field => <label className="permit-scope-field" key={field.key}><span><strong>{field.label}</strong><small>{field.help}</small></span><select aria-label={field.label} value={file[field.key]} onChange={event => change(draft => { draft[field.key] = event.target.value as Answer; })}>{answers.map(answer => <option key={answer} value={answer}>{answer === "unknown" ? "Not confirmed" : answer === "yes" ? "Yes" : "No"}</option>)}</select></label>)}</div>
            <div className="permit-neutral-note"><CircleAlert size={17} /><p>These declarations are not legal determinations. Accessibility, seismic triggers, energy requirements, trade permits, and professional licensing still require qualified review. Residential ADU measurements are not used in this workspace.</p></div>
          </>}
          {section === "sources" && <>
            <div className="permit-section-intro"><div><h2>City guidance behind the workflow.</h2><p>Source-linked coordination rules, with technical and permit decisions left to the responsible reviewer.</p></div></div>
            {PERMIT_SOURCES.map(source => <article className="permit-source" key={source.id}><a href={source.url} target="_blank" rel="noreferrer"><h3>{source.title}<ArrowRight size={15} /></h3></a><p>{source.note}</p><small>{source.section} · Accessed {source.accessed}</small></article>)}
            <div className="permit-neutral-note"><FileCheck2 size={17} /><p>Standard Single PDF corrections use changed plan pages with the reviewer checksheet, item-by-item response, and applicable supporting documents. The Facility Permit Program follows a separate replacement-set workflow. This draft does not bundle your PDFs or submit to DevHub.</p></div>
          </>}
        </div>
      </section>
      <aside className="permit-sidebar">
        <section className="permit-agent-panel"><div className="permit-panel-heading"><ClipboardList size={18} /><h2>Coordination agent</h2></div><div className="permit-mode"><span className={`permit-status-dot ${connected ? "live" : ""}`} />{connected ? "Meta connected · live requests" : "Manual review · Meta disconnected"}</div><p className="permit-help">Muse Spark inspects this case, checks readiness, and proposes responses against your registered excerpts.</p><label className="permit-field">Agent request<textarea aria-label="Commercial coordination request" maxLength={2000} rows={4} value={instruction} onChange={event => setInstruction(event.target.value)} /></label><p className="permit-send-disclosure">Sending shares this case’s comments, scope declarations, and text excerpts with Meta through Schema’s server. Use the fictional sample or documents you may share.</p><button className="button primary permit-run-agent" disabled={busy || !!checked.error} onClick={() => void runAgent()}>{busy ? <><LoaderCircle className="spin" size={15} /> Coordinating…</> : connected ? <>Send to Meta <ArrowRight size={15} /></> : <>Connect Meta <Link2 size={15} /></>}</button>
          {result && <div className="permit-agent-result" aria-live="polite"><span className="permit-result-label">Live Meta result · {result.model}</span><p>{result.message}</p><details><summary>Tools used <ChevronDown size={13} /></summary><ol>{result.steps.map((step, index) => <li key={index}><strong>{step.tool}</strong><p>{step.detail}</p></li>)}</ol></details>{result.proposal && <><h3>Proposed drafts</h3>{result.proposal.updates.map(update => <div className="permit-proposed-response" key={update.id}><strong>{update.id} · {update.owner || "Owner needed"}</strong><p>{update.response}</p><small>{update.evidence.length} evidence reference{update.evidence.length === 1 ? "" : "s"}</small></div>)}<button className="button primary" onClick={applyDrafts} disabled={result.proposal.baseRevision !== file.revision}>Apply drafts for review <ArrowRight size={14} /></button>{result.proposal.baseRevision !== file.revision && <p className="permit-warning-text">Case changed. Run Meta again before applying.</p>}</>}</div>}
        </section>
        <section className="permit-gate-panel"><div className="permit-panel-heading"><FileCheck2 size={18} /><h2>Handoff check</h2></div><div className={`permit-readiness ${assessment?.readyForHandoff ? "ready" : ""}`}><span className="permit-status-dot" /><strong>{assessment?.readyForHandoff ? "Applicant review recorded" : "Work remains before handoff"}</strong></div><p className="permit-help">Response completeness and evidence links only. City acceptance, drawing adequacy, and permit approval remain separate.</p><div className="permit-readiness-count"><strong>{readyCount}<span> / {file.items.length}</span></strong><span>registered items reviewed<br />with current evidence</span></div>{assessment && assessment.blockers.length > 0 && <><h3>Resolve next</h3><ul className="permit-gate-list">{assessment.blockers.map(blocker => <li key={blocker.id}><CircleAlert size={13} /><div><strong>{blocker.title}</strong><p>{blocker.detail}</p></div></li>)}</ul></>}{!assessment && <p className="permit-warning-text">Complete the current fields to run checks.</p>}<button className="permit-text-button" onClick={() => setSection("scope")}>Review case scope <ArrowRight size={13} /></button></section>
        <p className="permit-storage-note">Saved in this browser. API keys are not included. Fictional examples demonstrate coordination, not municipal approval.</p>
      </aside>
    </div>
  </div>;
}
