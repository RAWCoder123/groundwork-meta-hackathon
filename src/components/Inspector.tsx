import {
  ChevronDown,
  CircleCheck,
  CircleAlert,
  CircleX,
  RotateCcw,
} from "lucide-react";
import { SITES } from "../domain/fixtures";
import type { Check, DesignPatch, Project } from "../domain/types";

export function OutcomeIcon({ outcome }: { outcome: Check["outcome"] }) {
  const Icon =
    outcome === "pass"
      ? CircleCheck
      : outcome === "fail"
        ? CircleX
        : CircleAlert;
  return (
    <Icon size={17} className={`outcome-${outcome}`} aria-label={outcome} />
  );
}

export function Inspector({
  project,
  checks,
  onChange,
  onSite,
  onEvidence,
  onReset,
}: {
  project: Project;
  checks: Check[];
  onChange: (patch: DesignPatch) => void;
  onSite: (id: string) => void;
  onEvidence: () => void;
  onReset: () => void;
}) {
  const field = (
    label: string,
    key: "width" | "depth" | "height" | "x" | "z",
    min: number,
    max: number,
  ) => (
    <label className="field-row">
      <span>{label}</span>
      <div className="number-wrap">
        <input
          aria-label={label}
          type="number"
          min={min}
          max={max}
          step={1}
          value={project.design[key]}
          onChange={(e) => {
            if (
              e.target.value !== "" &&
              Number.isFinite(e.target.valueAsNumber)
            )
              onChange({ [key]: e.target.valueAsNumber });
          }}
        />
        <span>ft</span>
      </div>
    </label>
  );
  const groups = [
    {
      title: "Boundary clearances",
      ids: ["west-setback", "east-setback", "front-setback", "rear-setback"],
    },
    { title: "Building height", ids: ["height"] },
    { title: "Footprint & coverage", ids: ["floor-area", "lot-coverage"] },
    {
      title: "Building clearance",
      ids: ["building-separation", "building-overlap"],
    },
    {
      title: "Site information",
      ids: ["dimensions-confirmed", "overlays-reviewed"],
    },
  ];
  return (
    <aside className="inspector panel">
      <div className="panel-heading">
        <div>
          <h2>Your design</h2>
          <p>Portland demonstration site</p>
        </div>
        <button
          className="icon-button"
          title="Reset design"
          aria-label="Reset design"
          onClick={onReset}
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <section className="inspector-section">
        <h3>Dimensions</h3>
        {field("Footprint width", "width", 8, 60)}
        {field("Footprint depth", "depth", 8, 60)}
        {field("Building height", "height", 8, 30)}
        <h3 className="subheading">Roof type</h3>
        <div className="segmented">
          <button
            className={project.design.roof === "gable" ? "selected" : ""}
            onClick={() => onChange({ roof: "gable" })}
          >
            Gable
          </button>
          <button
            className={project.design.roof === "flat" ? "selected" : ""}
            onClick={() => onChange({ roof: "flat" })}
          >
            Flat
          </button>
        </div>
      </section>
      <section className="inspector-section">
        <h3>Position on site</h3>
        {field("From west", "x", -100, 200)}
        {field("From front", "z", -100, 200)}
        <label className="site-label" htmlFor="site">
          Site
        </label>
        <div className="select-wrap">
          <select
            id="site"
            value={project.site.id}
            onChange={(e) => onSite(e.target.value)}
          >
            {SITES.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </div>
        <p className="site-size">
          {project.site.width} × {project.site.depth} ft · fictional lot
        </p>
      </section>
      <section className="inspector-section area-section">
        <div>
          <h3>Footprint area</h3>
          <p>Single-story concept</p>
        </div>
        <strong>
          {(project.design.width * project.design.depth).toLocaleString()}
          <small>sq ft</small>
        </strong>
      </section>
      <section className="inspector-section check-section">
        <div className="section-label">
          <h3>Measured checks</h3>
          <span>Sample rules</span>
        </div>
        {groups.map((group) => {
          const rows = checks.filter((c) => group.ids.includes(c.id));
          const outcome = rows.some((c) => c.outcome === "fail")
            ? "fail"
            : rows.some((c) => c.outcome === "review")
              ? "review"
              : "pass";
          const detail =
            outcome === "fail"
              ? "Outside a sample limit"
              : outcome === "review"
                ? "Requires review"
                : "Within sample limits";
          return (
            <button
              className="check-summary"
              key={group.title}
              onClick={onEvidence}
            >
              <OutcomeIcon outcome={outcome} />
              <span>
                <b>{group.title}</b>
                <small>{detail}</small>
              </span>
              <ChevronDown size={13} className="turn-left" />
            </button>
          );
        })}
      </section>
    </aside>
  );
}
