import { CircleDashed, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Artifact, AutoProject, Critique } from "../autonomy/types";

const labels: Record<Critique["status"], string> = {
  clear: "No misleading claims found",
  revision_requested: "Revision requested",
  revised: "Revised after review",
  unaddressed: "Findings not addressed",
  unavailable: "Review did not run",
};

/** The latest independent critic result covering this proposal part. It is review input, never approval. */
export function IndependentReview({ project, artifact }: { project: AutoProject; artifact: Artifact }) {
  const critique = [...(project.critiques ?? [])].reverse().find(c => c.artifactVersions[artifact.id] !== undefined || c.revisedVersions?.[artifact.id] !== undefined);
  if (!critique) return null;
  const reviewed = critique.artifactVersions[artifact.id], revised = critique.revisedVersions?.[artifact.id];
  const changedSince = (revised ?? reviewed) !== artifact.revision;
  const findings = critique.findings.filter(f => f.artifactKind === artifact.kind);
  const Icon = critique.status === "clear" || critique.status === "revised" ? ShieldCheck : critique.status === "unavailable" ? CircleDashed : ShieldAlert;
  return <section className={`sa-review-check ${critique.status}`} aria-label="Independent review">
    <div className="sa-review-check-head"><Icon size={16} aria-hidden="true"/><h3>Independent review</h3><span>{labels[critique.status]}</span></div>
    <p>
      {critique.status === "unavailable" ? (critique.note ?? "The independent review did not complete for this stage.") : `A separate Meta review read revision ${reviewed ?? revised} before this checkpoint.`}
      {revised !== undefined && reviewed !== undefined && revised !== reviewed && ` Schema revised it to revision ${revised} in response.`}
      {changedSince && " This part has changed since then."}
    </p>
    {findings.length > 0 && <ul>{findings.map((f, index) => <li key={index}>
      <strong>{f.severity === "blocking" ? "Blocking" : "Advisory"}</strong>
      <q>{f.claim}</q>
      <span>{f.issue}</span>
    </li>)}</ul>}
    <small>Review input only. It does not establish compliance or replace professional review.</small>
  </section>;
}
