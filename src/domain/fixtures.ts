import type { Design, Project, Rule, Site } from "./types";

/** Entirely fictional lots; no property-owner information or survey data. */
export const SITES: Site[] = [
  {
    id: "alder",
    name: "Alder courtyard",
    description: "Fictional 50 × 100 ft lot · Portland study",
    width: 50,
    depth: 100,
    house: { x: 10, z: 15, width: 30, depth: 36 },
    latitude: 45.5152,
    longitude: -122.6784,
    north: 0,
    dimensionsConfirmed: true,
    overlaysReviewed: false,
    primaryFloorArea: 1400,
  },
  {
    id: "cedar",
    name: "Cedar garden",
    description: "Fictional 60 × 110 ft lot · Portland study",
    width: 60,
    depth: 110,
    house: { x: 12, z: 16, width: 32, depth: 38 },
    latitude: 45.5152,
    longitude: -122.6784,
    north: 0,
    dimensionsConfirmed: true,
    overlaysReviewed: false,
    primaryFloorArea: 1650,
  },
  {
    id: "birch",
    name: "Birch narrow lot",
    description: "Fictional 40 × 95 ft lot · measurements unconfirmed",
    width: 40,
    depth: 95,
    house: { x: 6, z: 12, width: 28, depth: 35 },
    latitude: 45.5152,
    longitude: -122.6784,
    north: 0,
    dimensionsConfirmed: false,
    overlaysReviewed: false,
    primaryFloorArea: 1100,
  },
];

export const DEFAULT_DESIGN: Design = {
  width: 24,
  depth: 24,
  height: 16,
  x: 15,
  z: 66,
  roof: "gable",
};

const zoning =
  "https://www.portland.gov/ppd/zoning-land-use/zoning-code-overview/adu-zoning";
const assumption =
  "Demonstration assumption, not an adopted Portland requirement. The linked city material is context only; applicability has not been established for these fictional sites.";

export const RULES: Rule[] = [
  {
    id: "setback",
    title: "Boundary clearance",
    value: 5,
    unit: "ft",
    source: zoning,
    section: "Location and detached accessory structure requirements",
    note: `A uniform 5 ft clearance is used only to demonstrate geometric checking. ${assumption}`,
    kind: "demonstration",
  },
  {
    id: "height",
    title: "Building height",
    value: 20,
    unit: "ft",
    source: zoning,
    section: "Height for detached ADUs",
    note: `The sample uses a 20 ft maximum. Actual city conditions depend on location and other requirements; this is not a complete height determination. ${assumption}`,
    kind: "demonstration",
  },
  {
    id: "area",
    title: "ADU footprint",
    value: 800,
    unit: "sq ft",
    source: zoning,
    section: "Size allowances for ADUs",
    note: `The sample checks footprint only against 800 sq ft. Actual city living-area limits include the smaller of 800 sq ft or 75% of the primary living area, with definitions and exceptions. Footprint is not verified living area. ${assumption}`,
    kind: "demonstration",
  },
  {
    id: "coverage",
    title: "Total footprint coverage",
    value: 45,
    unit: "%",
    source: zoning,
    section: "Building coverage and base-zone requirements",
    note: `45% total footprint coverage is a demonstration threshold. It does not implement Portland's accessory-structure coverage conditions or a parcel-specific base-zone maximum. ${assumption}`,
    kind: "demonstration",
  },
  {
    id: "separation",
    title: "Building clearance",
    value: 6,
    unit: "ft",
    source: zoning,
    section:
      "Detached structures; consult building/fire requirements separately",
    note: `6 ft is a demonstration clearance between footprint rectangles. It is not a fire-separation or building-code determination. ${assumption}`,
    kind: "demonstration",
  },
  {
    id: "overlap",
    title: "Building overlap",
    value: 0,
    unit: "sq ft",
    source: zoning,
    section: "Concept geometry",
    note: "Concept geometry condition: proposed and existing building footprints must not overlap. It establishes no legal, fire, structural or permit conclusion.",
    kind: "demonstration",
  },
];

export function makeProject(siteId?: string): Project {
  const selected = SITES.find((site) => site.id === siteId) ?? SITES[0];
  const site: Site = { ...selected, house: { ...selected.house } };
  const design = { ...DEFAULT_DESIGN };
  design.x = Math.min(design.x, site.width - design.width - 5);
  design.z = Math.min(design.z, site.depth - design.depth - 5);
  return { name: `${site.name} ADU`, site, design, revision: 1 };
}
