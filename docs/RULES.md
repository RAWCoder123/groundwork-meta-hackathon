# Groundwork rule scope

Groundwork has two distinct layers: the original **demonstration geometry engine** and a **small source-derived Portland comparison module**. The original six rules remain `kind: 'demonstration'`; they have not been relabeled as city standards. In `portland.ts`, `kind: 'verified'` means the threshold was traced to an official source, **not** that a parcel, legal interpretation, measurement, design or permit has been verified.

All included sites are fictional: they are not drawn from a survey, taxlot, owner record or cadastral dataset. Their latitude/longitude is a city-level coordinate for sun-position visualization. Property-specific applicability always remains `review`, including when all isolated numerical comparisons pass.

## Coordinate and measurement contract

- Units: feet, square feet, and percentage points.
- `x` is measured east from the west property boundary. `z` is measured away from the street/front boundary.
- All rectangle locations refer to their west/front lower-left corner, not their center.
- The rectangular footprint extends from `x` through `x + width`, and `z` through `z + depth`.
- Building separation is the shortest Euclidean distance between the two footprint rectangles. Touching rectangles have zero separation. Overlap is the intersecting footprint area.
- The scene's height control is overall bounding/peak height; it is never silently substituted for Portland code-measured height.
- Footprint is not code living area. The legacy total footprint check sums the two conceptual rectangles; the Portland layer separately requires confirmation that the rectangles represent code-defined building coverage plus a declared inventory of other accessory coverage.
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

## Source-derived Portland subset

`checkPortland(project, facts)` adds seven isolated comparisons. Without the required declarations it returns `review`. `fixturePortlandFacts(project)` supplies a hypothetical R5, flat interior lot with one new detached ADU, one house, declared street/entrance orientation, and no other accessory coverage **only** for unchanged canonical fictional site geometry. It does not confirm any real parcel. Birch's unconfirmed dimensions prevent definitive source-based numeric outcomes.

| Check | Source-derived calculation | Additional inputs and limits |
| --- | --- | --- |
| ADU location | At least 40 ft from the front line **or** behind the defined primary rear wall. | Declared street at Z=0 and primary entrance orientation. Other setbacks remain separate. |
| Combined accessory coverage | All detached/connected covered accessory structures ≤20% of site area. | Code-coverage declaration and complete other-accessory inventory. |
| Individual accessory coverage | Proposed structure ≤greater of smallest primary structure coverage or 900 sq ft. | One primary structure in this scope. Other structures are not individually checked. |
| Total building coverage | Table 110-5 lot-area bands, below. | Complete code-defined covered-structure inventory. |
| ADU living area | ≤smaller of 800 sq ft or 75% of post-creation primary living area. | Separately declared primary and ADU living areas, with current `measurementRevision`. Footprint and `primaryFloorArea` are never substituted. |
| Accessory height | Isolated 20 ft cap outside ordinary R5 setbacks. | Separately declared code-measured height and current `measurementRevision`. An intrusion produces review; no unsupported exception or legal failure is inferred. |
| Applicability | Always `review`. | Eligibility, overlays, exceptions and other requirements remain unresolved. |

Table 110-5 allowance for lot area `A` in square feet:

```text
A < 3,000:              0.50 × A
3,000 ≤ A < 5,000:      1,500 + 0.375 × (A − 3,000)
5,000 ≤ A < 20,000:     2,250 + 0.15 × (A − 5,000)
A ≥ 20,000:            4,500 + 0.075 × (A − 20,000)
```

Computed maximum allowances are rounded down to whole square feet using 33.930.020.B.1. Actual comparison values are stored in each check's `limit`. Dynamic/informational rule metadata uses `value: null`, never an invented numeric cap.

For the height branch, ordinary R5 wall clearances are front 10 ft and side/rear 5 ft from Table 110-4. The conditional side/rear intrusion option in 33.110.245.C.2.b has multiple limits involving footprint, combined structures, wall height, screening, openings, dormers and rooftop decks. It is **not implemented**. No standalone result here establishes setback compliance. Additional architectural standards above 15 ft also remain review items.

Height depends on grade and roof reference points in 33.930.050.A. Gable height uses the average gable reference, while single-dwelling flat roofs use the parapet top or highest roof point when there is no parapet. The app therefore requires a separate declaration rather than inferring code height from the visual model. Living area excludes exterior-wall thickness, garages and specified low/inaccessible areas under 33.910. Coverage can include roofed/elevated structures beyond enclosed walls. These measurements require review.

## Official sources accessed October 27, 2026

- [Chapter 33.205](https://www.portland.gov/sites/default/files/code/205-acc-dwelling-unit_0.pdf), 33.205.040.C.1–3: size, location and base-zone accessory standards. Relevant PDF page stamp: October 1, 2024.
- [Chapter 33.110](https://www.portland.gov/sites/default/files/code/110-sd-zone_2.pdf), Table 110-4, 33.110.225.B/Table 110-5, 33.110.245.C.1–4 and 33.110.030: R5 baseline and accessory standards. Relevant page stamps: March 1, 2025 and January 1, 2025.
- [Chapter 33.930](https://www.portland.gov/sites/default/files/code/930-measurements_0.pdf), 33.930.020.B.1, .025, .030 and .050.A: rounding and measurement methods. Relevant page stamp: August 1, 2021.
- [Chapter 33.910](https://www.portland.gov/sites/default/files/code/910-definitions_0.pdf), Living Area, Building Coverage and Lot Lines definitions. Relevant page stamp: July 1, 2026.
- [Detached Covered Accessory Structures Worksheet](https://www.portland.gov/ppd/documents/detached-covered-accessory-structures-worksheet/download), Steps 1–4. Document date: September 26, 2024.

These are **source page dates**, not asserted legal effective dates for every provision. Chapter landing pages list later update packets. `PORTLAND_SOURCES` records access date, relevant page dates, exact sections and `effectiveDate: null` rather than inventing legal effective-date metadata. A qualified review and current-code refresh remain necessary before applying this subset to a real parcel.

The authoritative accessory coverage text allows the greater of 900 sq ft or the smallest primary structure's coverage. The simplified ADU overview's coverage summary should not replace that code text.

[Portland ADU zoning guide](https://www.portland.gov/ppd/zoning-land-use/zoning-code-overview/adu-zoning) links the underlying code and Detached Covered Accessory Structures Worksheet. Its summary demonstrates why a simple universal rule set would be misleading:

- City size allowances depend on primary living area and definitions; a footprint-only threshold does not implement them.
- Height conditions depend on placement and other standards.
- Accessory structure coverage and base-zone requirements are distinct from the sample total footprint threshold.
- Location, design, historic status, eligibility, multiple-unit conditions and other provisions can affect a project.

The guide remains context, not a claim that all its requirements are implemented. Source tracing is distinct from independent legal/parcel review. The module covers only the listed arithmetic and declarations. Missing predicates must produce `review`.

## Outcomes and repair

Legacy geometric checks can pass or fail against the sample assumptions. Portland comparisons can pass or fail only against the isolated source-based condition under supported declarations. Property-specific applicability always remains review; living area and code height remain review until separately declared for the current revision. Any design revision makes those prior declarations stale. Measurements from an unconfirmed site do not yield definitive Portland results.

`proposeRepair` searches bounded positions and, if necessary, reduces conceptual dimensions and height. It verifies the actual rounded patch before returning it. It never marks unknown property facts reviewed. Passing after a repair means only that the fictional geometry satisfies these sample thresholds.

## Exclusions

This version does not assess full zoning eligibility, lot entitlements, easements, utilities, trees, slopes, hazards, overlays, access, structure, soils, building/fire codes, energy use or permit completeness. It does not generate construction-grade drawings, submit applications, issue permits, or grant any legal approval. Sun/shadow visuals are geometry studies, not validated environmental performance predictions.
