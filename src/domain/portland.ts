import { SITES } from "./fixtures";
import type { Check, Project, Rule } from "./types";

/** Declarations for a narrow hypothetical study, never certification of a parcel. */
export type PortlandFacts = {
  zone?: string;
  interiorLot?: boolean;
  flatSite?: boolean;
  oneNewDetachedAduWithHouse?: boolean;
  streetAtZ0AndPrimaryEntranceFacesStreet?: boolean;
  footprintMatchesCodeCoverage?: boolean;
  otherAccessoryCoverageSqFt?: number;
  primaryLivingAreaSqFt?: number;
  aduLivingAreaSqFt?: number;
  codeMeasuredHeightFt?: number;
  measurementRevision?: number;
};

export type PortlandRule = Omit<Rule, "value"> & { value: number | null };

export const PORTLAND_SOURCES = [
  {
    id: "portland-adu-code",
    title: "Portland Chapter 33.205 — Accessory Dwelling Units",
    url: "https://www.portland.gov/sites/default/files/code/205-acc-dwelling-unit_0.pdf",
    sections: ["33.205.040.C.1", "33.205.040.C.2", "33.205.040.C.3"],
    sourcePageDates: ["2024-10-01"],
    accessedAt: "2026-10-27",
    effectiveDate: null,
    note: "Relevant PDF page date is recorded; it is not asserted to be the effective date of every provision.",
  },
  {
    id: "portland-r5-code",
    title: "Portland Chapter 33.110 — Single-Dwelling Zones",
    url: "https://www.portland.gov/sites/default/files/code/110-sd-zone_2.pdf",
    sections: [
      "33.110.030",
      "Table 110-4",
      "33.110.225.B / Table 110-5",
      "33.110.245.C.1–4",
    ],
    sourcePageDates: ["2025-03-01", "2025-01-01"],
    accessedAt: "2026-10-27",
    effectiveDate: null,
    note: "The chapter landing page lists later update packets; these are the dates printed on the relevant linked PDF pages.",
  },
  {
    id: "portland-measurements",
    title: "Portland Chapter 33.930 — Measurements",
    url: "https://www.portland.gov/sites/default/files/code/930-measurements_0.pdf",
    sections: ["33.930.020.B.1", "33.930.025", "33.930.030", "33.930.050.A"],
    sourcePageDates: ["2021-08-01"],
    accessedAt: "2026-10-27",
    effectiveDate: null,
    note: "Explains computed maximum rounding, distance reference points, grade and roof-dependent height. The app does not infer code height from its peak-height control.",
  },
  {
    id: "portland-definitions",
    title: "Portland Chapter 33.910 — Definitions",
    url: "https://www.portland.gov/sites/default/files/code/910-definitions_0.pdf",
    sections: ["Building Coverage", "Living Area", "Lot Lines"],
    sourcePageDates: ["2026-07-01"],
    accessedAt: "2026-10-27",
    effectiveDate: null,
    note: "Coverage and living area are different measurements. Exterior-wall thickness and specified non-living areas are excluded from living area.",
  },
  {
    id: "portland-accessory-worksheet",
    title: "Detached Covered Accessory Structures Worksheet",
    url: "https://www.portland.gov/ppd/documents/detached-covered-accessory-structures-worksheet/download",
    sections: ["Steps 1–4"],
    sourcePageDates: ["2024-09-26"],
    accessedAt: "2026-10-27",
    effectiveDate: null,
    note: "Official explanatory worksheet, not a replacement for applicable code. Additional site and use requirements remain.",
  },
] as const;

const aduSource = PORTLAND_SOURCES[0].url;
const r5Source = PORTLAND_SOURCES[1].url;
const conditional =
  "Source-derived preliminary threshold only. Its application to any real parcel, measurement definitions, exceptions, other requirements and approvals remain unverified.";

/** `verified` means traced to an official source, never verified parcel compliance. */
export const PORTLAND_RULES: PortlandRule[] = [
  {
    id: "portland-adu-location",
    title: "Portland ADU location",
    value: 40,
    unit: "ft",
    source: aduSource,
    section: "33.205.040.C.2",
    note: `At least 40 ft from the front lot line OR behind the primary dwelling’s defined rear wall. Only a rectangular interior lot with the declared street/entrance orientation is calculated. ${conditional}`,
    kind: "verified",
  },
  {
    id: "portland-accessory-coverage",
    title: "Portland combined accessory coverage",
    value: 20,
    unit: "%",
    source: r5Source,
    section: "33.110.245.C.3.a",
    note: `All detached and connected covered accessory structures combined may cover no more than 20% of site area. A complete inventory and code-coverage declaration are required. ${conditional}`,
    kind: "verified",
  },
  {
    id: "portland-individual-coverage",
    title: "Portland individual accessory coverage",
    value: 900,
    unit: "sq ft",
    source: r5Source,
    section: "33.110.245.C.3.b",
    note: `Each covered accessory structure is limited to the greater of the smallest primary structure’s coverage or 900 sq ft. This study has one primary structure. ${conditional}`,
    kind: "verified",
  },
  {
    id: "portland-total-coverage",
    title: "Portland total building coverage",
    value: null,
    unit: "sq ft",
    source: r5Source,
    section: "33.110.225.B / Table 110-5",
    note: `The maximum is calculated from lot area using the four Table 110-5 bands. See each check’s calculated limit. ${conditional}`,
    kind: "verified",
  },
  {
    id: "portland-living-area",
    title: "Portland ADU living area",
    value: 800,
    unit: "sq ft",
    source: aduSource,
    section: "33.205.040.C.1; 33.910 Living Area",
    note: `For the supported new detached ADU with one house, limit is the smaller of 800 sq ft or 75% of post-creation primary living area. Requires separately declared current-revision code living areas; footprint and primaryFloorArea are not substituted. ${conditional}`,
    kind: "verified",
  },
  {
    id: "portland-height",
    title: "Portland accessory height",
    value: 20,
    unit: "ft",
    source: r5Source,
    section: "33.110.245.C.1–2; 33.930.050.A",
    note: `20 ft cap is checked only outside ordinary R5 setbacks using separately declared current-revision code-measured height. The side/rear intrusion option and additional design standards above 15 ft need review. ${conditional}`,
    kind: "verified",
  },
  {
    id: "portland-applicability",
    title: "Portland applicability and remaining requirements",
    value: null,
    unit: "",
    source: r5Source,
    section: "33.110.030; 33.205.040.B–C",
    note: "Always requires review. Conditional source calculations do not determine eligibility, complete zoning/building compliance, professional certification or permit approval.",
    kind: "verified",
  },
];

const EPSILON = 1e-7;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const nonnegative = (value: unknown): value is number =>
  finite(value) && value >= 0;
const positive = (value: unknown): value is number =>
  finite(value) && value > 0;
const display = (value: number) => Math.round(value * 100) / 100;
const maximum = (value: number) => Math.floor(value + 1e-9);

/** Table 110-5 arithmetic; returns a whole-square-foot computed maximum. */
export function portlandTotalCoverageLimit(siteAreaSqFt: number): number {
  if (!positive(siteAreaSqFt))
    throw new Error(
      "Site area must be a positive finite number of square feet.",
    );
  const allowance =
    siteAreaSqFt < 3000
      ? siteAreaSqFt * 0.5
      : siteAreaSqFt < 5000
        ? 1500 + (siteAreaSqFt - 3000) * 0.375
        : siteAreaSqFt < 20000
          ? 2250 + (siteAreaSqFt - 5000) * 0.15
          : 4500 + (siteAreaSqFt - 20000) * 0.075;
  return maximum(allowance);
}

/** Canonical fictional site declarations; not confirmation of any real property. */
export function fixturePortlandFacts(project: Project): PortlandFacts {
  const canonical = SITES.find((site) => site.id === project.site.id);
  if (
    !canonical ||
    canonical.width !== project.site.width ||
    canonical.depth !== project.site.depth ||
    (["x", "z", "width", "depth"] as const).some(
      (key) => canonical.house[key] !== project.site.house[key],
    )
  )
    return {};
  return {
    zone: "R5",
    interiorLot: true,
    flatSite: true,
    oneNewDetachedAduWithHouse: true,
    streetAtZ0AndPrimaryEntranceFacesStreet: true,
    footprintMatchesCodeCoverage: true,
    otherAccessoryCoverageSqFt: 0,
    // Living area and code-measured height are deliberately not inferred.
  };
}

export function checkPortland(
  project: Project,
  facts: PortlandFacts = {},
): Check[] {
  const { site, design } = project;
  const declaredScope =
    facts.zone === "R5" &&
    facts.interiorLot === true &&
    facts.flatSite === true &&
    facts.oneNewDetachedAduWithHouse === true;
  const geometryValid =
    [
      site.width,
      site.depth,
      site.house.width,
      site.house.depth,
      design.width,
      design.depth,
    ].every(positive) &&
    [site.house.x, site.house.z, design.x, design.z].every(finite) &&
    site.house.x >= 0 &&
    site.house.z >= 0 &&
    site.house.x + site.house.width <= site.width &&
    site.house.z + site.house.depth <= site.depth;
  const supported =
    declaredScope && geometryValid && site.dimensionsConfirmed === true;
  const measuredCurrent =
    Number.isSafeInteger(facts.measurementRevision) &&
    facts.measurementRevision === project.revision;
  const area = geometryValid ? site.width * site.depth : null;
  const footprint = geometryValid ? design.width * design.depth : null;
  const primaryCoverage = geometryValid
    ? site.house.width * site.house.depth
    : null;
  const coverageKnown =
    supported &&
    facts.footprintMatchesCodeCoverage === true &&
    nonnegative(facts.otherAccessoryCoverageSqFt);
  const review = (
    id: string,
    title: string,
    detail: string,
    unit = "",
    measured: number | null = null,
    limit: number | null = null,
  ): Check => ({
    id,
    title,
    outcome: "review",
    measured,
    limit,
    unit,
    detail,
    ruleId: id,
  });
  const maxCheck = (
    id: string,
    title: string,
    measured: number,
    limit: number,
    unit: string,
    detail: string,
  ): Check => ({
    id,
    title,
    outcome: measured <= limit + EPSILON ? "pass" : "fail",
    measured: display(measured),
    limit,
    unit,
    detail: `${detail} Declared ${display(measured)} ${unit}; calculated maximum ${limit} ${unit}. Preliminary comparison only; applicability remains under review.`,
    ruleId: id,
  });
  const scopeReason = !declaredScope
    ? "Declare the supported R5, flat interior lot with one new detached ADU and one house. Other project types and exceptions are not implemented."
    : !geometryValid
      ? "Site/building geometry is incomplete or invalid; no source-based numeric result is returned."
      : "Site dimensions are unconfirmed; source-based geometry comparisons require review.";

  let location: Check;
  if (!supported || facts.streetAtZ0AndPrimaryEntranceFacesStreet !== true)
    location = review(
      "portland-adu-location",
      "Portland ADU location",
      supported
        ? "Front lot line and primary entrance/rear-wall orientation must be declared before checking the 40 ft-or-rear-wall alternative."
        : scopeReason,
      "ft",
    );
  else {
    const behindRearWall =
      design.z + EPSILON >= site.house.z + site.house.depth;
    const frontDistance = design.z;
    location = {
      id: "portland-adu-location",
      title: "Portland ADU location",
      outcome:
        frontDistance + EPSILON >= 40 || behindRearWall ? "pass" : "fail",
      measured: display(frontDistance),
      limit: 40,
      unit: "ft",
      ruleId: "portland-adu-location",
      detail: `33.205.040.C.2: ${display(frontDistance)} ft from the declared front lot line; ${behindRearWall ? "behind" : "not behind"} the declared primary rear wall at ${display(site.house.z + site.house.depth)} ft. Either 40 ft from front or behind that wall meets this isolated location comparison. Other setbacks and applicability remain under review.`,
    };
  }

  const accessory = coverageKnown
    ? maxCheck(
        "portland-accessory-coverage",
        "Portland combined accessory coverage",
        footprint! + facts.otherAccessoryCoverageSqFt!,
        maximum(area! * 0.2),
        "sq ft",
        "33.110.245.C.3.a: complete declared accessory inventory compared with 20% of site area.",
      )
    : review(
        "portland-accessory-coverage",
        "Portland combined accessory coverage",
        !supported
          ? scopeReason
          : "Confirm the rectangles match code-defined building coverage and declare the coverage of all other detached/connected accessory structures.",
        "sq ft",
      );
  const individual = coverageKnown
    ? maxCheck(
        "portland-individual-coverage",
        "Portland individual accessory coverage",
        footprint!,
        maximum(Math.max(primaryCoverage!, 900)),
        "sq ft",
        "33.110.245.C.3.b: this proposed structure compared with the greater of the sole primary structure’s coverage or 900 sq ft. Other structures are not individually checked.",
      )
    : review(
        "portland-individual-coverage",
        "Portland individual accessory coverage",
        !supported
          ? scopeReason
          : "Code-defined coverage of the proposed structure and sole primary structure must be confirmed; the complete accessory inventory must be declared.",
        "sq ft",
      );
  const total = coverageKnown
    ? maxCheck(
        "portland-total-coverage",
        "Portland total building coverage",
        primaryCoverage! + footprint! + facts.otherAccessoryCoverageSqFt!,
        portlandTotalCoverageLimit(area!),
        "sq ft",
        "33.110.225.B / Table 110-5: all declared covered structures compared with the lot-area band allowance.",
      )
    : review(
        "portland-total-coverage",
        "Portland total building coverage",
        !supported
          ? scopeReason
          : "A complete code-defined covered-structure inventory is required; this check cannot assume undeclared structures are absent.",
        "sq ft",
      );
  const livingAreaKnown =
    supported &&
    measuredCurrent &&
    positive(facts.primaryLivingAreaSqFt) &&
    positive(facts.aduLivingAreaSqFt);
  const living = livingAreaKnown
    ? maxCheck(
        "portland-living-area",
        "Portland ADU living area",
        facts.aduLivingAreaSqFt!,
        maximum(Math.min(800, facts.primaryLivingAreaSqFt! * 0.75)),
        "sq ft",
        "33.205.040.C.1: separately declared post-creation code living areas; neither footprint nor primaryFloorArea is used.",
      )
    : review(
        "portland-living-area",
        "Portland ADU living area",
        !supported
          ? scopeReason
          : "Declare positive post-creation primary and ADU living areas in square feet using the code definition, and bind them to the current project revision. Footprint and primaryFloorArea are not living-area measurements.",
        "sq ft",
      );
  const ordinarySetbacks =
    geometryValid &&
    design.x + EPSILON >= 5 &&
    site.width - design.x - design.width + EPSILON >= 5 &&
    design.z + EPSILON >= 10 &&
    site.depth - design.z - design.depth + EPSILON >= 5;
  const height = !supported
    ? review("portland-height", "Portland accessory height", scopeReason, "ft")
    : !ordinarySetbacks
      ? review(
          "portland-height",
          "Portland accessory height",
          "The design is inside an ordinary R5 setback. The conditional side/rear intrusion option has additional dimensions, wall-height, openings and screening requirements; it is not implemented. No legal failure or 20 ft allowance is inferred.",
          "ft",
        )
      : !measuredCurrent || !positive(facts.codeMeasuredHeightFt)
        ? review(
            "portland-height",
            "Portland accessory height",
            "Declare current-revision height measured using 33.930.050 grade and roof reference points. The scene’s peak/bounding height is not substituted for code height.",
            "ft",
          )
        : maxCheck(
            "portland-height",
            "Portland accessory height",
            facts.codeMeasuredHeightFt!,
            20,
            "ft",
            "33.110.245.C.1: only the 20 ft cap outside ordinary setbacks is compared. Above 15 ft, additional architectural standards require separate review.",
          );
  const applicability = review(
    "portland-applicability",
    "Portland applicability and remaining requirements",
    "Always requires professional/authority review: actual zone, ADU eligibility, current code applicability, overlays, title/easements, trees, outdoor area, FAR, design details, building/fire rules, access, utilities and engineering are not resolved. Fictional declarations and isolated source-derived comparisons do not establish legal compliance or permit approval.",
  );
  return [
    location,
    accessory,
    individual,
    total,
    living,
    height,
    applicability,
  ];
}
