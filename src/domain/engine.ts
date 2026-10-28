import { checkPortland, fixturePortlandFacts } from "./portland";
import { RULES } from "./fixtures";
import type { Check, Design, DesignPatch, Project, Rect } from "./types";

const EPSILON = 1e-7;
const ALLOWED = new Set(["width", "depth", "height", "x", "z", "roof"]);
const BOUNDS = {
  width: [8, 60],
  depth: [8, 60],
  height: [8, 30],
  x: [-100, 200],
  z: [-100, 200],
} as const;

/** A bounded scene schema; values are feet. No coercion, unknown keys, or executable code. */
export function validateDesign(input: unknown): Design {
  if (input === null || typeof input !== "object" || Array.isArray(input))
    throw new Error("Design must be an object.");
  const candidate = input as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !ALLOWED.has(key)))
    throw new Error("Design contains unsupported fields.");
  for (const [key, [minimum, maximum]] of Object.entries(BOUNDS)) {
    const value = candidate[key];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < minimum ||
      value > maximum
    ) {
      throw new Error(
        `${key} must be a finite number between ${minimum} and ${maximum} ft.`,
      );
    }
  }
  if (candidate.roof !== "gable" && candidate.roof !== "flat")
    throw new Error("Roof must be gable or flat.");
  return {
    width: candidate.width as number,
    depth: candidate.depth as number,
    height: candidate.height as number,
    x: candidate.x as number,
    z: candidate.z as number,
    roof: candidate.roof,
  };
}

export function applyPatch(project: Project, patch: DesignPatch): Project {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch))
    throw new Error("Patch must be an object.");
  if (Object.keys(patch).some((key) => !ALLOWED.has(key)))
    throw new Error("Patch contains unsupported fields.");
  const design = validateDesign({ ...project.design, ...patch });
  return { ...project, design, revision: project.revision + 1 };
}

export function rectangleDistance(a: Rect, b: Rect): number {
  const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const dz = Math.max(a.z - (b.z + b.depth), b.z - (a.z + a.depth), 0);
  return Math.hypot(dx, dz);
}

function overlapArea(a: Rect, b: Rect): number {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.z + a.depth, b.z + b.depth) - Math.max(a.z, b.z))
  );
}

const round = (value: number) => Math.round(value * 100) / 100;

/** All numeric thresholds below are sample assumptions, not verified city standards. */
export function checkProject(project: Project): Check[] {
  const { site, design } = project;
  validateDesign(design);
  if (
    ![
      site.width,
      site.depth,
      site.house.x,
      site.house.z,
      site.house.width,
      site.house.depth,
    ].every(Number.isFinite) ||
    site.width <= 0 ||
    site.depth <= 0 ||
    site.house.width <= 0 ||
    site.house.depth <= 0
  ) {
    throw new Error("Site geometry must contain positive finite dimensions.");
  }
  const limit = (id: string) => RULES.find((rule) => rule.id === id)!.value;
  const numeric = (
    id: string,
    title: string,
    measured: number,
    maximum: number,
    unit: string,
    minimum: boolean,
    ruleId: string,
  ): Check => ({
    id,
    title,
    outcome: (
      minimum ? measured + EPSILON >= maximum : measured <= maximum + EPSILON
    )
      ? "pass"
      : "fail",
    measured: round(measured),
    limit: maximum,
    unit,
    ruleId,
    detail: `${round(measured)} ${unit} measured; sample ${minimum ? "minimum" : "maximum"} ${maximum} ${unit}. Demonstration assumption only.`,
  });
  const footprint = design.width * design.depth;
  const overlap = overlapArea(design, site.house);
  const checks: Check[] = [
    numeric(
      "west-setback",
      "West boundary",
      design.x,
      limit("setback"),
      "ft",
      true,
      "setback",
    ),
    numeric(
      "east-setback",
      "East boundary",
      site.width - design.x - design.width,
      limit("setback"),
      "ft",
      true,
      "setback",
    ),
    numeric(
      "front-setback",
      "Front boundary",
      design.z,
      limit("setback"),
      "ft",
      true,
      "setback",
    ),
    numeric(
      "rear-setback",
      "Rear boundary",
      site.depth - design.z - design.depth,
      limit("setback"),
      "ft",
      true,
      "setback",
    ),
    numeric(
      "height",
      "Building height",
      design.height,
      limit("height"),
      "ft",
      false,
      "height",
    ),
    numeric(
      "floor-area",
      "ADU footprint",
      footprint,
      limit("area"),
      "sq ft",
      false,
      "area",
    ),
    numeric(
      "lot-coverage",
      "Total footprint coverage",
      (100 * (footprint + site.house.width * site.house.depth)) /
        (site.width * site.depth),
      limit("coverage"),
      "%",
      false,
      "coverage",
    ),
    numeric(
      "building-separation",
      "Building clearance",
      rectangleDistance(design, site.house),
      limit("separation"),
      "ft",
      true,
      "separation",
    ),
    {
      id: "building-overlap",
      title: "Building overlap",
      outcome: overlap <= EPSILON ? "pass" : "fail",
      measured: round(overlap),
      limit: 0,
      unit: "sq ft",
      ruleId: "overlap",
      detail:
        overlap <= EPSILON
          ? "Building footprints do not overlap in the sample geometry."
          : `${round(overlap)} sq ft of proposed footprint overlaps the existing building.`,
    },
    {
      id: "dimensions-confirmed",
      title: "Site measurements",
      outcome: site.dimensionsConfirmed ? "pass" : "review",
      measured: null,
      limit: null,
      unit: "",
      ruleId: null,
      detail: site.dimensionsConfirmed
        ? "Fictional fixture dimensions are declared for this demonstration. They are not a property survey."
        : "Measurements are unconfirmed. Numeric results are provisional until the site geometry is checked.",
    },
    {
      id: "overlays-reviewed",
      title: "Property-specific requirements",
      outcome: site.overlaysReviewed ? "pass" : "review",
      measured: null,
      limit: null,
      unit: "",
      ruleId: null,
      detail: site.overlaysReviewed
        ? "Marked reviewed in this project; the app has not independently verified zoning, title, easements, or hazards."
        : "Zoning eligibility, overlays, easements, utilities, trees, access, hazards, building/fire rules and engineering remain outside this demonstration and require review.",
    },
  ];
  return [...checks, ...checkPortland(project, fixturePortlandFacts(project))];
}

function patchFrom(before: Design, after: Design): DesignPatch {
  const patch: DesignPatch = {};
  for (const key of ["width", "depth", "height", "x", "z"] as const) {
    if (Math.abs(before[key] - after[key]) > EPSILON)
      patch[key] = Math.round(after[key] * 1000) / 1000;
  }
  return patch;
}

/** Find a measured feasible sample layout; unknown site facts remain unresolved. */
export function proposeRepair(project: Project): DesignPatch | null {
  const before = validateDesign(project.design);
  if (!checkProject(project).some((check) => check.outcome === "fail"))
    return null;
  const { site } = project;
  const setback = RULES.find((rule) => rule.id === "setback")!.value;
  const heightLimit = RULES.find((rule) => rule.id === "height")!.value;
  const maximumArea = Math.min(
    RULES.find((rule) => rule.id === "area")!.value,
    (site.width *
      site.depth *
      RULES.find((rule) => rule.id === "coverage")!.value) /
      100 -
      site.house.width * site.house.depth,
  );
  if (maximumArea < 64 || site.width < 26 || site.depth < 26) return null;
  let width = Math.min(before.width, site.width - 2 * setback);
  let depth = Math.min(before.depth, site.depth - 2 * setback);
  if (width * depth > maximumArea) {
    const scale = Math.sqrt(maximumArea / (width * depth));
    width = Math.max(8, Math.floor(width * scale * 100) / 100);
    depth = Math.max(8, Math.floor(depth * scale * 100) / 100);
  }
  // Try preserving the requested footprint first, then progressively smaller alternatives.
  for (let factor = 1; factor >= 0.3; factor -= 0.05) {
    const w = Math.max(8, Math.floor(width * factor * 100) / 100);
    const d = Math.max(8, Math.floor(depth * factor * 100) / 100);
    const maxX = site.width - setback - w,
      maxZ = site.depth - setback - d;
    if (maxX < setback || maxZ < setback || w * d > maximumArea + EPSILON)
      continue;
    const xs = new Set([
      setback,
      maxX,
      Math.max(setback, Math.min(before.x, maxX)),
    ]);
    const zs = new Set([
      setback,
      maxZ,
      Math.max(setback, Math.min(before.z, maxZ)),
      Math.max(setback, Math.min(site.house.z + site.house.depth + 6, maxZ)),
    ]);
    for (let x = setback; x <= maxX; x += 1) xs.add(x);
    for (let z = setback; z <= maxZ; z += 1) zs.add(z);
    let best: Design | null = null,
      bestScore = Infinity;
    for (const x of xs)
      for (const z of zs) {
        const candidate = {
          ...before,
          width: w,
          depth: d,
          height: Math.min(before.height, heightLimit),
          x,
          z,
        };
        const fails = checkProject({ ...project, design: candidate }).some(
          (check) => check.outcome === "fail",
        );
        if (fails) continue;
        const score = Math.hypot(x - before.x, z - before.z);
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    if (best) {
      const patch = patchFrom(before, best);
      // Recheck the rounded patch, which is the actual mutation the UI receives.
      if (
        !checkProject(applyPatch(project, patch)).some(
          (check) => check.outcome === "fail",
        )
      )
        return patch;
    }
  }
  return null;
}
