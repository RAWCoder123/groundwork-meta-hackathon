import { applyPatch, checkProject, proposeRepair, validateDesign } from "./engine";
import type { Check, Design, DesignPatch, Project } from "./types";

export type DesignOption = {
  id: "compact" | "larger";
  name: string;
  description: string;
  project: Project;
  patch: DesignPatch;
  checks: Check[];
  metrics: {
    footprint: number;
    openGround: number;
    nearestBoundary: number;
    buildingClearance: number;
  };
  supported: boolean;
};

const alternatives = [
  { id: "compact", name: "Compact option", scale: 0.82 },
  { id: "larger", name: "Larger option", scale: 1.15 },
] as const;

const boundedDimension = (value: number) =>
  Math.max(8, Math.min(60, Math.round(value)));

function designDifference(before: Design, after: Design): DesignPatch {
  const patch: DesignPatch = {};
  for (const field of ["width", "depth", "height", "x", "z"] as const) {
    if (before[field] !== after[field]) patch[field] = after[field];
  }
  if (before.roof !== after.roof) patch.roof = after.roof;
  return patch;
}

/** Two illustrative local alternatives, not an exhaustive or optimal site search. */
export function compareOptions(project: Project): DesignOption[] {
  validateDesign(project.design);
  return alternatives.map(({ id, name, scale }) => {
    let candidate = applyPatch(project, {
      width: boundedDimension(project.design.width * scale),
      depth: boundedDimension(project.design.depth * scale),
    });
    if (checkProject(candidate).some((check) => check.outcome === "fail")) {
      const repair = proposeRepair(candidate);
      if (repair) candidate = applyPatch(candidate, repair);
    }

    // The final option is one reviewable edit from the caller's original revision.
    const patch = designDifference(project.design, candidate.design);
    const result = applyPatch(project, patch);
    const checks = checkProject(result);
    const { site, design } = result;
    const footprint = design.width * design.depth;
    const buildingClearance = checks.find(
      (check) => check.id === "building-separation",
    )?.measured;
    if (buildingClearance == null)
      throw new Error("Building clearance measurement is unavailable.");

    return {
      id,
      name,
      description:
        "Illustrative size alternative, adjusted where a measured repair is available. Modeled open ground is lot area minus the two footprints; it does not establish usable garden area or stormwater performance. Unresolved reviews remain open.",
      project: result,
      patch,
      checks,
      metrics: {
        footprint,
        openGround:
          site.width * site.depth -
          site.house.width * site.house.depth -
          footprint,
        nearestBoundary: Math.min(
          design.x,
          design.z,
          site.width - design.x - design.width,
          site.depth - design.z - design.depth,
        ),
        buildingClearance,
      },
      supported: !checks.some((check) => check.outcome === "fail"),
    };
  });
}

/** Rank only the generated options that have no failing implemented checks. */
export function recommendOption(
  options: DesignOption[],
  priority: "open-ground" | "floor-space",
): DesignOption | null {
  const metric = priority === "open-ground" ? "openGround" : "footprint";
  return (
    options
      .filter((option) => option.supported)
      .sort((a, b) => {
        const difference = b.metrics[metric] - a.metrics[metric];
        if (difference !== 0) return difference;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      })[0] ?? null
  );
}
