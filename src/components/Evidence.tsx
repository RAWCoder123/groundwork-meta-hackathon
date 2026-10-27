import { ArrowUpRight, BookOpen } from "lucide-react";
import { RULES } from "../domain/fixtures";
import type { Check, Project } from "../domain/types";
import { OutcomeIcon } from "./Inspector";
export function Evidence({
  project,
  checks,
}: {
  project: Project;
  checks: Check[];
}) {
  return (
    <div className="document-view">
      <div className="document-title">
        <BookOpen size={22} />
        <div>
          <h1>Every finding, in view.</h1>
          <p>
            Measured results for revision {project.revision}. Thresholds are
            demonstration assumptions.
          </p>
        </div>
      </div>
      <div className="scope-note">
        <strong>What these checks establish</strong>
        <p>
          The dimensions below are calculated from this fictional site model.
          The sample thresholds demonstrate the workflow; they have not been
          verified as applicable Portland requirements. Source links provide
          context, not evidence of compliance.
        </p>
      </div>
      <div className="evidence-table">
        <div className="evidence-header">
          <span>Check</span>
          <span>Measured</span>
          <span>Sample limit</span>
          <span>Result</span>
        </div>
        {checks.map((check) => (
          <details className="evidence-row" key={check.id}>
            <summary>
              <span className="check-title">
                <OutcomeIcon outcome={check.outcome} />
                {check.title}
              </span>
              <span>
                {check.measured === null
                  ? "—"
                  : `${check.measured} ${check.unit}`}
              </span>
              <span>
                {check.limit === null ? "—" : `${check.limit} ${check.unit}`}
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
              {check.ruleId && (
                <p>{RULES.find((rule) => rule.id === check.ruleId)?.note}</p>
              )}
            </div>
          </details>
        ))}
      </div>
      <h2 className="sources-heading">Source context</h2>
      <p className="source-description">
        Official guidance accessed October 27, 2026. A dated, independently
        reviewed local rule set is required before use on a real project.
      </p>
      <a
        className="source-link"
        href="https://www.portland.gov/ppd/zoning-land-use/zoning-code-overview/adu-zoning"
        target="_blank"
        rel="noreferrer"
      >
        <div>
          <b>Portland ADU zoning requirements</b>
          <small>
            City of Portland · Official overview and links to underlying code
          </small>
        </div>
        <ArrowUpRight size={17} />
      </a>
      <a
        className="source-link"
        href="https://www.portland.gov/ppd/residential-permitting/home-projects/accessory-dwelling-units"
        target="_blank"
        rel="noreferrer"
      >
        <div>
          <b>ADU application and permit guide</b>
          <small>
            City of Portland · Required plans and application process
          </small>
        </div>
        <ArrowUpRight size={17} />
      </a>
    </div>
  );
}
