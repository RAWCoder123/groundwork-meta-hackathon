# Groundwork design specification

The primary concept is `design-concept.png`, generated with the built-in image-generation tool on October27,2026. Prompt: a complete three-column architecture planning editor with editable dimensions, a central3D site canvas, a local/Meta assistant, evidence and activity views, and a sun slider. This is a design reference, not a product screenshot.

## Design system

- Canvas: porcelain `#f4f5f1`; chrome: white `#ffffff`; text: graphite `#252b27`; muted `#777c75`; borders `#e3e5df`.
- Primary action: olive `#44513c`; selection: ochre `#bf9655`; warning: amber `#aa7329`; failure: clay `#a35242`.
- Typography: system sans-serif,18px section headings,14px body,12px captions; tabular numerals for dimensions.
- Components: quiet rectangular buttons, segmented controls, input rows, fine separated list rows, a contiguous canvas with bottom sun controls. Avoid nested card grids.
- Desktop:64px header,40px notice,260px inspector, flexible scene,320px assistant. On smaller screens retain scene priority and stack the controls with accessible mobile tabs.
- Core text: Groundwork; Backyard studio; Design; Evidence; Activity; Connect Meta; Export packet; Your design; Dimensions; Roof type; Position on site; Site; Footprint area; Measured checks; Planning assistant; Local demonstration; Meta disconnected; Tell me what you would like to change; Make it larger; Move toward the boundary; Find a better fit; Describe a design change; Sun & shadow.

## Required correctness differences from concept

The generated concept invented a zone pass, a24ft legal height and a parking check. These are deliberately replaced with actual computed sample check results and explicitly marked assumptions. The center is actual draggable WebGL geometry rather than a static photorealistic image. Labels and output follow the current project state. These changes are necessary for verifiable function and truthful scope.

## Implementation comparison

Compared the concept and final browser capture using image inspection. Browser checks used1280×720, a1100×720 contained desktop viewport, and a390×720 mobile viewport. The available browser could not reproduce the concept's1536×1024 native size; a temporary same-origin viewport frame was used for responsive inspection and removed before publication.

| Comparison | Result |
| --- | --- |
| Layout | Preserved header, scope strip, inspector, central canvas, assistant, and sun controls. Mobile stacks the scene before controls. |
| Typography | System sans-serif with separate heading, label and dimension scales; increased small chrome and canvas labels after inspection. |
| Palette | White panels, porcelain canvas, olive actions, muted ochre selection. |
| Containers and spacing | Fine dividers, compact inputs, segmented controls and open panels; no card-grid substitution. |
| Controls and copy | Core labels match; invented legal passes in concept replaced with computed sample results and explicit scope. Added functioning mode selection and proposal review. |
| Geometry | Intentionally uses real schematic WebGL geometry rather than the concept's photoreal render; dimensions, shadows and dragging respond to state. |

Fixed viewport-height expansion, clipped composition, label legibility and geographic handedness. Verified boundary failure→repair→apply→evidence, direct plan dragging, half-hour sun input and export. The above-the-fold copy comparison retained the intended workflow; deliberate differences are the truthful sample statuses, fixture names, revision and control hints. No known unresolved layout clipping remains at the tested widths.
