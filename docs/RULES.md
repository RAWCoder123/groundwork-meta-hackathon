# Groundwork rule scope

This first implementation is a **demonstration geometry engine**. Every numeric rule is tagged `kind: 'demonstration'`. None is a verified property-specific municipal requirement. The sites are fictional: they are not drawn from a survey, taxlot, owner record or cadastral dataset. Their latitude/longitude is a city-level coordinate for a sun-position visualization.

## Coordinate and measurement contract

- Units: feet, square feet, and percentage points.
- `x` is measured east from the west property boundary. `z` is measured away from the street/front boundary.
- All rectangle locations refer to their west/front lower-left corner, not their center.
- The rectangular footprint extends from `x` through `x + width`, and `z` through `z + depth`.
- Building separation is the shortest Euclidean distance between the two footprint rectangles. Touching rectangles have zero separation. Overlap is the intersecting footprint area.
- Height is the concept's overall bounding height; roof and statutory measurement conventions are not implemented.
- Footprint is not verified habitable floor area. Total footprint coverage sums the two conceptual rectangles.
- Numeric equality at a threshold passes, with an epsilon of `1e-7` to avoid floating-point edge errors. Measurements display to two decimals, but checks evaluate the underlying value.

## Implemented assumptions

| ID | Demonstration threshold | Purpose |
| --- | --- | --- |
| `setback` | 5 ft from all four boundaries | Interactive geometric clearance example. |
| `height` | 20 ft maximum | Bounded conceptual massing. |
| `area` | 800 sq ft footprint maximum | Size-conflict example. |
| `coverage` | 45% total footprint maximum | Cumulative area example. |
| `separation` | 6 ft between building footprints | Rectangle-distance example. |
| `overlap` | 0 sq ft overlap | Geometric collision check. |

Do not describe these as Portland's rules. The four uniform clearances, total coverage threshold and building separation are sample assumptions. They are not a fire, engineering, legal, zoning or permit determination.

## Official context accessed October 27, 2026

[Portland ADU zoning guide](https://www.portland.gov/ppd/zoning-land-use/zoning-code-overview/adu-zoning) links the underlying code and Detached Covered Accessory Structures Worksheet. Its summary demonstrates why a simple universal rule set would be misleading:

- City size allowances depend on primary living area and definitions; a footprint-only threshold does not implement them.
- Height conditions depend on placement and other standards.
- Accessory structure coverage and base-zone requirements are distinct from the sample total footprint threshold.
- Location, design, historic status, eligibility, multiple-unit conditions and other provisions can affect a project.

The guide is linked as **context**, not a claim that its rules have been fully implemented. Before adding a verified rule, record its effective date, authoritative section, applicability predicates, source excerpt, exceptions, measurement definitions, and independent review. Ensure the supported input data is enough to establish all predicates. A missing predicate must produce `review`.

## Outcomes and repair

Geometric checks can pass or fail against the sample assumptions. Measurement confirmation and property-specific requirements are separate review outcomes. The default fixture always retains a property-review finding. Numeric results from an unconfirmed site are provisional.

`proposeRepair` searches bounded positions and, if necessary, reduces conceptual dimensions and height. It verifies the actual rounded patch before returning it. It never marks unknown property facts reviewed. Passing after a repair means only that the fictional geometry satisfies these sample thresholds.

## Exclusions

This version does not assess full zoning eligibility, lot entitlements, easements, utilities, trees, slopes, hazards, overlays, access, structure, soils, building/fire codes, energy use or permit completeness. It does not generate construction-grade drawings, submit applications, issue permits, or grant any legal approval. Sun/shadow visuals are geometry studies, not validated environmental performance predictions.
