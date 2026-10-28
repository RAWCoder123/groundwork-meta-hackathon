import { ArrowUpRight, BookOpen } from "lucide-react";
import { RULES } from "../domain/fixtures";
import { PORTLAND_RULES, PORTLAND_SOURCES } from "../domain/portland";
import type { Check, Project } from "../domain/types";
import { OutcomeIcon } from "./Inspector";
export function Evidence({
  project,
  checks,
}: {
  project: Project;
  checks: Check[];
}) {
  const table = (rows: Check[], label: string) => (
    <div className="evidence-table">
      <div className="evidence-header">
        <span>Check</span>
        <span>Measured</span>
        <span>{label}</span>
        <span>Result</span>
      </div>
      {rows.map((check) => (
        <details className="evidence-row" key={check.id}>
          <summary>
            <span className="check-title">
              <OutcomeIcon outcome={check.outcome} />
              {check.title.replace("Portland ", "")}
            </span>
            <span>
              {check.measured === null
                ? "—"
                : `${check.measured} ${check.unit}`}
            </span>
            <span>
              {check.limit === null ? "Review" : `${check.limit} ${check.unit}`}
            </span>
            <span className={`result-text outcome-${check.outcome}`}>
              {check.outcome === "review"
                ? "Review"
                : check.outcome === "fail"
                  ? "Outside limit"
                  : "Within limit"}
            </span>
          </summary>
          <div className="check-detail">
            <p>{check.detail}</p>
            {check.ruleId &&
              (() => {
                const rule = [...RULES, ...PORTLAND_RULES].find(
                  (rule) => rule.id === check.ruleId,
                );
                return rule ? (
                  <>
                    <p>{rule.note}</p>
                    <a href={rule.source} target="_blank" rel="noreferrer">
                      {rule.kind === "verified" ? "Official source" : "Context"}{" "}
                      · {rule.section} ↗
                    </a>
                  </>
                ) : null;
              })()}
          </div>
        </details>
      ))}
    </div>
  );
  return (
    <div className="document-view">
      <div className="document-title">
        <BookOpen size={22} />
        <div>
          <h1>Every finding, in view.</h1>
          <p>
            Measured results for revision {project.revision}. The basis of each
            check is explicit.
          </p>
        </div>
      </div>
      <div className="scope-note">
        <strong>A fictional site, with a declared scenario</strong>
        <p>
          The source-linked checks below use selected Portland requirements
          under a hypothetical R5, flat interior-lot scenario with one new
          detached ADU and only the shown structures. Real parcel eligibility,
          complete coverage inventory, measurement definitions, exceptions and
          approvals are not verified. Unknown living area and code-measured
          height remain unresolved.
        </p>
      </div>
      <h2 className="evidence-section-title">
        Source-linked Portland R5 scenario
      </h2>
      {table(
        checks.filter((c) => c.id.startsWith("portland-")),
        "Scenario limit",
      )}
      <h2 className="evidence-section-title">
        Additional demonstration geometry
      </h2>
      <p className="source-description">
        These sample thresholds demonstrate the repair loop. They are not
        adopted legal requirements.
      </p>
      {table(
        checks.filter((c) => !c.id.startsWith("portland-")),
        "Sample limit",
      )}
      <h2 className="sources-heading">Official source record</h2>
      <p className="source-description">
        Accessed October 27, 2026. Printed page dates are recorded separately
        from effective dates; professional review remains necessary.
      </p>
      {PORTLAND_SOURCES.map((source) => (
        <a
          key={source.id}
          className="source-link"
          href={source.url}
          target="_blank"
          rel="noreferrer"
        >
          <div>
            <b>{source.title}</b>
            <small>{source.sections.join(" · ")}</small>
          </div>
          <ArrowUpRight size={17} />
        </a>
      ))}
    </div>
  );
}
