"use client";
import { useState } from "react";
import {
  assessCorrections,
  responseFingerprint,
  type ReviewComment,
} from "../autonomy/corrections";
import type { AutoProject } from "../autonomy/types";
export function CorrectionsPanel({
  project,
  busy,
  action,
}: {
  project: AutoProject;
  busy: boolean;
  action: (path: string, data: unknown) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false),
    [draftRows, setDraftRows] = useState<ReviewComment[]>([]),
    [error, setError] = useState(""),
    [support, setSupport] = useState<Record<string, string>>({}),
    [draftRevision, setDraftRevision] = useState(0),
    [oldId, setOldId] = useState(""),
    [newId, setNewId] = useState("");
  const report = assessCorrections(project),
    base = `/api/autonomy/projects/${project.id}`,
    register = project.corrections;
  const evidence = (ref: {
    documentId: string;
    page: number;
    quote: string;
    revision: number;
  }) => (
    <details key={`${ref.documentId}:${ref.page}:${ref.quote}`}>
      <summary>
        Source page {ref.page} · revision {ref.revision}
      </summary>
      <blockquote>{ref.quote}</blockquote>
      {project.documents.find((d) => d.id === ref.documentId)?.supersededBy && (
        <p>
          This is a historical file revision. The response needs reassessment
          using the replacement.
        </p>
      )}
      <a
        href={`${base}/documents/${encodeURIComponent(ref.documentId)}/file#page=${ref.page}`}
        target="_blank"
        rel="noreferrer"
      >
        Open original PDF at this page
      </a>
    </details>
  );
  async function saveRegister() {
    try {
      const saved = await action(`${base}/review-register`, {
        comments: draftRows,
        registerRevision: draftRevision,
      });
      if (!saved) return;
      setEditing(false);
      setError("");
    } catch {
      setError(
        "Original wording and page quotations must match the uploaded files. Check the highlighted source before saving.",
      );
    }
  }
  if (project.entryPoint !== "corrections" && !register) return null;
  return (
    <section
      className="sa-corrections"
      aria-label="Correction response coordination"
    >
      <h2>Reviewer comments & responses</h2>
      <p>
        The register preserves what the reviewer asked. Drafting, evidence
        support, applicant review and city acceptance are separate.
      </p>
      {!register ? (
        <p>
          Upload the checksheet. Schema will propose the complete comment
          register for your review.
        </p>
      ) : (
        <>
          <div className="sa-correction-summary">
            <strong>
              {report.coverage} of {report.total} comments accounted for.
            </strong>
            <span>
            {report.confirmed
              ? "Register confirmed."
              : "Register needs your completeness review."}{" "}
            {report.responseSetReviewed
              ? "Applicant responses and source support reviewed; city acceptance remains unverified."
              : "Coordination handoff only; unresolved work remains."}
            </span>
          </div>
          <p>
            {report.duplicateNumbers
              ?.map(
                (d) =>
                  `Reviewer number ${d.number} repeats across ${d.disciplines.join(" and ")}; these remain separate comments.`,
              )
              .join(" ")}
          </p>
          <div className="sa-inline-actions">
            <button
              disabled={busy}
              onClick={() => {
                setDraftRows(structuredClone(register.comments));
                setDraftRevision(register.revision);
                setEditing(!editing);
              }}
            >
              Correct extracted register
            </button>
            {!report.confirmed && (
              <button
                disabled={busy}
                onClick={() =>
                  void action(`${base}/confirm-register`, {
                    revision: register.revision,
                  })
                }
              >
                Confirm this register is complete
              </button>
            )}
          </div>
          {editing && (
            <div>
              <p>
                Compare each comment with its source. Preserve original
                numbering and wording, including subitems.
              </p>
              {draftRows.map((row, index) => (
                <fieldset key={row.id}>
                  <legend>Comment {index + 1}</legend>
                  {(
                    ["number", "discipline", "responsible", "wording"] as const
                  ).map((key) => (
                    <label key={key}>
                      {key === "number"
                        ? "Original reviewer number"
                        : key === "responsible"
                          ? "Responsible person"
                          : key === "wording"
                            ? "Original wording"
                            : "Discipline"}
                      <textarea
                        rows={key === "wording" ? 3 : 1}
                        value={row[key]}
                        onChange={(e) =>
                          setDraftRows((rows) =>
                            rows.map((r, i) =>
                              i === index ? { ...r, [key]: e.target.value } : r,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                  <label>
                    Source document
                    <select
                      value={row.source.documentId}
                      onChange={(e) => {
                        const d = project.documents.find(
                          (d) => d.id === e.target.value,
                        )!;
                        setDraftRows((rows) =>
                          rows.map((r, i) =>
                            i === index
                              ? {
                                  ...r,
                                  source: {
                                    documentId: d.id,
                                    revision: d.revision ?? 1,
                                    sha256: d.sha256,
                                    page: 1,
                                    quote: "",
                                  },
                                }
                              : r,
                          ),
                        );
                      }}
                    >
                      {project.documents
                        .filter((d) => !d.supersededBy)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Source page
                    <input
                      type="number"
                      min={1}
                      max={
                        project.documents.find(
                          (d) => d.id === row.source.documentId,
                        )?.pages
                      }
                      value={row.source.page}
                      onChange={(e) =>
                        setDraftRows((rows) =>
                          rows.map((r, i) =>
                            i === index
                              ? {
                                  ...r,
                                  source: {
                                    ...r.source,
                                    page: Number(e.target.value),
                                  },
                                }
                              : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Exact source passage
                    <textarea
                      rows={3}
                      value={row.source.quote}
                      onChange={(e) =>
                        setDraftRows((rows) =>
                          rows.map((r, i) =>
                            i === index
                              ? {
                                  ...r,
                                  source: {
                                    ...r.source,
                                    quote: e.target.value,
                                  },
                                }
                              : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Parent comment
                    <select
                      value={row.parentId ?? ""}
                      onChange={(e) =>
                        setDraftRows((rows) =>
                          rows.map((r, i) =>
                            i === index
                              ? { ...r, parentId: e.target.value || null }
                              : r,
                          ),
                        )
                      }
                    >
                      <option value="">Top-level comment</option>
                      {draftRows
                        .filter((r) => r.id !== row.id)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.discipline} {r.number}
                          </option>
                        ))}
                    </select>
                  </label>
                  {evidence(row.source)}
                  <label>
                    <input
                      type="checkbox"
                      checked={!row.uncertain}
                      onChange={(e) =>
                        setDraftRows((rows) =>
                          rows.map((r, i) =>
                            i === index
                              ? { ...r, uncertain: !e.target.checked }
                              : r,
                          ),
                        )
                      }
                    />
                    I checked this extraction against its source.
                  </label>
                  <button
                    className="sa-text-link"
                    onClick={() =>
                      setDraftRows((rows) => rows.filter((_, i) => i !== index))
                    }
                  >
                    Remove mistakenly extracted item
                  </button>
                </fieldset>
              ))}
              <button
                className="sa-button"
                disabled={
                  busy || !project.documents.some((d) => !d.supersededBy)
                }
                onClick={() => {
                  const d = project.documents.find((d) => !d.supersededBy)!;
                  setDraftRows((rows) => [
                    ...rows,
                    {
                      id: crypto.randomUUID(),
                      number: "",
                      wording: "",
                      discipline: "",
                      responsible: "",
                      parentId: null,
                      source: {
                        documentId: d.id,
                        revision: d.revision ?? 1,
                        sha256: d.sha256,
                        page: 1,
                        quote: "",
                      },
                      uncertain: true,
                    },
                  ]);
                }}
              >
                Add omitted comment
              </button>
              <button
                className="sa-button"
                disabled={busy}
                onClick={() => void saveRegister()}
              >
                Save corrected register
              </button>
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          {report.issues.length > 0 && <details className="sa-review-checks">
            <summary>{report.issues.length} checks need attention</summary>
            <ul className="sa-correction-issues">
            {report.issues.map((issue, i) => (
              <li key={i}>{issue.detail}</li>
            ))}
            </ul>
          </details>}
          {report.items.map((item) => (
            <article className="sa-correction-row" key={item.comment.id}>
              <div className="sa-correction-heading">
              <h3>
                {item.comment.discipline || "Unassigned discipline"} ·{" "}
                {item.comment.number}
              </h3>
              <span className={`sa-review-label ${item.reviewed ? "reviewed" : ""}`}>
                {item.reviewed ? "Reviewed" : item.draft ? "Review needed" : "Draft missing"}
              </span>
              </div>
              <p>{item.comment.wording}</p>
              {evidence(item.comment.source)}
              <p>Responsible: {item.comment.responsible || "Not assigned"}</p>
              {item.draft ? (
                <>
                  <h4>Response draft</h4>
                  <p>{item.draft.response}</p>
                  {item.draft.evidence.map(evidence)}
                  <p>
                    {item.reviewed
                      ? "Current response reviewed."
                      : "Current response needs applicant review."}{" "}
                    {item.supported
                      ? "Passage support confirmed by the applicant."
                      : "Supporting evidence is not confirmed."}{" "}
                    City acceptance: not recorded.
                  </p>
                  {item.unresolved.length > 0 && (
                    <ul>
                      {item.unresolved.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  )}
                  <label className="sa-review-support">
                    <input
                      type="checkbox"
                      checked={
                        support[item.comment.id] ===
                        responseFingerprint(project, item.draft)
                      }
                      onChange={(e) =>
                        setSupport((s) => ({
                          ...s,
                          [item.comment.id]: e.target.checked
                            ? responseFingerprint(project, item.draft!)
                            : "",
                        }))
                      }
                    />
                    I reviewed the cited passages and confirm they support this
                    response.
                  </label>
                  <button
                    className="sa-button"
                    disabled={
                      busy ||
                      !item.evidenceCurrent ||
                      support[item.comment.id] !==
                        responseFingerprint(project, item.draft)
                    }
                    onClick={() =>
                      void action(`${base}/review-response`, {
                        commentId: item.comment.id,
                        fingerprint: responseFingerprint(project, item.draft!),
                        supportConfirmed: true,
                        note: "Applicant reviewed the current response and cited passages.",
                      })
                    }
                  >
                    Record review of this response
                  </button>
                </>
              ) : (
                <p>No response drafted. This item remains in the handoff.</p>
              )}
            </article>
          ))}
          <details>
            <summary>Replace a referenced drawing</summary>
            <p>
              Upload the new file first. This preserves the old revision and
              reopens only responses that depend on it.
            </p>
            <label>
              Current source
              <select value={oldId} onChange={(e) => setOldId(e.target.value)}>
                <option value="">Choose existing source</option>
                {project.documents
                  .filter((d) => !d.supersededBy)
                  .map((d) => (
                    <option value={d.id} key={d.id}>
                      {d.name} · revision {d.revision ?? 1}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Uploaded replacement
              <select value={newId} onChange={(e) => setNewId(e.target.value)}>
                <option value="">Choose new upload</option>
                {project.documents
                  .filter(
                    (d) => !d.supersededBy && !d.seriesId && d.id !== oldId,
                  )
                  .map((d) => (
                    <option value={d.id} key={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="sa-button"
              disabled={busy || !oldId || !newId}
              onClick={() =>
                void action(`${base}/replace-document`, { oldId, newId })
              }
            >
              Record replacement revision
            </button>
          </details>
        </>
      )}
    </section>
  );
}
