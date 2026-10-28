import { useMemo, useState } from "react";
import { ArrowRight, Check, GitCompareArrows } from "lucide-react";
import { compareOptions, recommendOption } from "../domain/decisions";
import type { Project, DesignPatch } from "../domain/types";
export function CompareDesigns({
  project,
  onApply,
}: {
  project: Project;
  onApply: (patch: DesignPatch) => void;
}) {
  const [priority, setPriority] = useState<"open-ground" | "floor-space">(
    "open-ground",
  );
  const options = useMemo(() => compareOptions(project), [project]);
  const recommended = recommendOption(options, priority);
  const n = (value: number) => Number(value.toFixed(1)).toLocaleString();
  return (
    <div className="document-view compare-view">
      <div className="document-title">
        <GitCompareArrows size={23} />
        <div>
          <h1>See the consequence of a choice.</h1>
          <p>
            Two illustrative alternatives for the same site. Every figure comes
            from the current model.
          </p>
        </div>
      </div>
      <div className="priority-control">
        <span>What matters more?</span>
        <div className="segmented">
          <button
            className={priority === "open-ground" ? "selected" : ""}
            onClick={() => setPriority("open-ground")}
          >
            More open ground
          </button>
          <button
            className={priority === "floor-space" ? "selected" : ""}
            onClick={() => setPriority("floor-space")}
          >
            Larger footprint
          </button>
        </div>
      </div>
      <div className="design-options">
        {options.map((option) => (
          <section
            key={option.id}
            className={`design-option ${recommended?.id === option.id ? "recommended" : ""}`}
          >
            <div className="option-name">
              <h2>{option.name}</h2>
              {recommended?.id === option.id && (
                <span>
                  <Check size={12} />
                  Best for your priority
                </span>
              )}
            </div>
            <p className="option-description">
              {option.id === "compact"
                ? "A smaller starting footprint, checked against this site."
                : "A larger starting footprint, checked against this site."}
            </p>
            <div className="option-figure">
              <svg
                viewBox={`0 0 ${project.site.width} ${project.site.depth}`}
                role="img"
                aria-label={`${option.name} site plan`}
              >
                <rect
                  x=".5"
                  y=".5"
                  width={project.site.width - 1}
                  height={project.site.depth - 1}
                  fill="#e7ebdf"
                  stroke="#99a68b"
                  strokeWidth=".5"
                />
                <rect
                  x={project.site.house.x}
                  y={
                    project.site.depth -
                    project.site.house.z -
                    project.site.house.depth
                  }
                  width={project.site.house.width}
                  height={project.site.house.depth}
                  fill="#fafbf7"
                  stroke="#9ca58f"
                  strokeWidth=".4"
                />
                <rect
                  x={option.project.design.x}
                  y={
                    project.site.depth -
                    option.project.design.z -
                    option.project.design.depth
                  }
                  width={option.project.design.width}
                  height={option.project.design.depth}
                  fill="#b69a73"
                  stroke="#8d784f"
                  strokeWidth=".6"
                />
              </svg>
              <div>
                <strong>
                  {n(option.metrics.footprint)}
                  <small>sq ft footprint</small>
                </strong>
                <p>
                  {n(option.project.design.width)} ×{" "}
                  {n(option.project.design.depth)} ft
                </p>
              </div>
            </div>
            <dl className="option-metrics">
              <div>
                <dt>Modeled open ground</dt>
                <dd>{n(option.metrics.openGround)} sq ft</dd>
              </div>
              <div>
                <dt>Smallest boundary gap</dt>
                <dd>{n(option.metrics.nearestBoundary)} ft</dd>
              </div>
              <div>
                <dt>Building clearance</dt>
                <dd>{n(option.metrics.buildingClearance)} ft</dd>
              </div>
            </dl>
            <p
              className={`option-outcome ${option.supported ? "" : "outcome-fail"}`}
            >
              {option.supported
                ? "Within the implemented numeric limits"
                : "Outside an implemented limit"}{" "}
              · {option.checks.filter((c) => c.outcome === "review").length}{" "}
              require review
            </p>
            <button
              className="button primary"
              disabled={!option.supported}
              onClick={() => onApply(option.patch)}
            >
              Use this design
              <ArrowRight size={14} />
            </button>
          </section>
        ))}
      </div>
      <div className="comparison-explanation">
        <h2>Why this recommendation?</h2>
        <p>
          {recommended
            ? `“${recommended.name}” has the ${priority === "open-ground" ? "most modeled open ground" : "largest footprint"} among these supported alternatives. The recommendation follows your selected priority; it is not a global optimum or a permit determination.`
            : "Neither alternative passes the implemented numeric checks. Review the constraints before choosing a layout."}
        </p>
        <p>
          Open ground is lot area minus the two modeled building footprints. It
          does not establish usable garden space, drainage or landscaping.
          Footprint is not interior living area. Cost, materials, maintenance
          and engineering performance are not estimated here.
        </p>
      </div>
    </div>
  );
}
