# Schema

[Public source repository](https://github.com/RAWCoder123/groundwork-meta-hackathon)

Schema is a commercial permit-correction coordination workspace built for the Meta Global AI Developer Hackathon. Its primary workflow is an existing Portland office tenant improvement: preserve reviewer items, coordinate response owners, link current plan excerpts, review Meta-generated drafts, and export a response handoff. Earlier residential design tools remain in separate views as a development study; their R5 rules are not commercial requirements. Existing repository and preview URLs retain the working name Groundwork.

**Current commercial scope:** Portland, Oregon standard Single PDF corrections for an interior, nonstructural, same-use office TI. The sample is fictional. Case inputs are registered text excerpts, not complete uploaded plan PDFs. The app does not certify drawings, establish code compliance, submit to DevHub, issue permits, or predict approval dates. Source links describe process requirements, not parcel-specific approval.

## Commercial workflow

- Open Permit desk, inspect the numbered reviewer comments and the current document-excerpt register.
- Record scope and permit-history/code-edition confirmation; unknowns remain explicit blockers.
- In connected Meta mode, explicitly send the case to a bounded Muse Spark tool loop: inspect case → assess readiness → propose evidence-linked responses.
- Review the proposed drafts before applying them. Evidence quotations, sheet identifiers, document IDs, and revision references must match the register. Drafting a response never approves it.
- Edit responses and references manually, review each recorded item, and see unresolved work. The fictional case deliberately lacks fire-alarm evidence.
- Changes invalidate approvals; proposals for an older case revision cannot be applied.
- Export a standalone HTML coordination packet with reviewer wording, responses, references, blockers, and source instructions. Print to PDF for review; actual drawing files still need separate preparation and applicant submission.
- Save a validated case in this browser's local storage. Keys remain separate and transient; this is not a shared customer records system.

See [commercial feasibility and execution](docs/COMMERCIAL-FEASIBILITY.md) for difficulty, competitive landscape, pilot gates, exclusions, and the route beyond the hackathon.

## Retained residential study

The separate design, comparison, evidence, and activity views retain these development features:

- Switch among three fictional sites: Alder courtyard, Cedar garden, and Birch narrow lot.
- Edit width, depth, overall concept height, roof, and placement; drag the ADU in 3D or plan view. Orbit and zoom the 3D scene. A plan fallback is available when WebGL is unavailable.
- Recalculate 18 outcomes: eleven demonstration geometry/fact checks and seven conditional source-linked Portland checks. Living area, code-measured height and real-property applicability remain unresolved without suitable declarations.
- Compare compact and larger alternatives. Choose modeled open ground or footprint as a priority, inspect measured trade-offs, and apply a checked alternative. Recommendations are among these two alternatives, not global optima.
- Select a PNG/JPEG/WebP plan up to 4 MB, explicitly send it to Meta, review transcribed printed dimensions and confirm before applying ADU dimensions. The service never estimates from pixels; missing dimensions remain unknown. A fictional example image is included. Site-size mismatches and stale results cannot be applied. Authenticated extraction still needs live acceptance.
- Change month and time to explore geometric sun/shadow visuals on a flat conceptual site. Sun position uses Portland local time; the existing house is assumed to be 25 ft high. This is not environmental performance analysis.
- Use limited local commands, such as `move 5 ft west`, `increase width by 4 ft`, `set width to 28`, or `repair the design`.
- Connect Muse Spark 1.3 for a server-side Meta Responses API tool loop. The model inspects the project, requests measured checks, and can propose a validated design patch. The user reviews a proposal before applying it.
- Undo changes, inspect session activity, and automatically save the current project in this browser's local storage.
- Download and restore a Schema project JSON file. Restoration supports the three included sites and validated design fields.
- Download a self-contained HTML handoff containing the current revision, dimensioned SVG site plan, findings, assumptions, unresolved items, and source context. Open the file in a browser to print or save as PDF.

Passing a sample check means only that the current geometry satisfies that sample assumption. The default project retains an unresolved property-specific review item. See [rule definitions and limitations](docs/RULES.md).

## Run locally

Use Node.js 24 and npm. From this directory:

```sh
npm install
npm run dev
```

Open the local URL printed by the development server, normally `http://127.0.0.1:5173`.

```sh
npm test
npm run build
npm run validate
```

The build type-checks the app, produces browser assets, and packages `dist/server/index.js` with the assets embedded. `dist/.openai/hosting.json` is the deployment manifest. Build output is ignored by Git. Deployment is separate: a local build does not establish hosted or live-Meta acceptance.

## Connect Meta

Activate a [Meta Model API account](https://dev.meta.ai/docs/quickstart), confirm billing and any hackathon credits, then use **Connect Meta** in the app. A key entered there stays in the tab's memory, is sent to this app's server and then to `https://api.meta.ai/v1`, and is cleared by a refresh or disconnect. It is not saved in project files or browser local storage. Do not paste credentials into chat, commit them, or include them in a demo recording.

For local development, `MODEL_API_KEY` may alternatively be set privately in an untracked `.env.local` file. Restart the development server after setting it. Do not use a `VITE_` prefix: that would make a value eligible for inclusion in the browser bundle. The connection dialog can verify the server key without entering another one. Hosted runtime secrets must be configured separately through the hosting provider; local environment files are not deployment configuration.

**Connection verification checks the model catalog.** It does not prove that generation succeeds or that credits are available. Before claiming live acceptance, complete a real request that invokes tools, returns a proposal, applies the reviewed change, and produces the matching packet.

### Actual agent flow

1. The browser sends the current project and request to `/api/agent`.
2. The server validates the project against the unchanged demonstration sites and bounds design fields.
3. In Meta mode, the server calls `muse-spark-1.3` through the Responses API.
4. The model can call `inspect_project`, `check_geometry`, `propose_repair`, `compare_design_options`, and `preview_design_patch`. Application code executes these tools; the model does not execute arbitrary code.
5. A selectable patch must pass the implemented sample geometric checks. Review outcomes remain unresolved. A patch stays a proposal until the user applies it.

The server limits request sizes, turns, tools, and duration. Meta errors are reported; a failed live request is never silently replaced with a local answer. Backend tests use controlled provider responses, which are not evidence of a successful authenticated Meta run.

## Not implemented

- PDF plan intake, arbitrary site reconstruction, or automatic confirmation of measurements.
- Professional validation of the source-linked subset, real-property applicability, or a complete jurisdiction rule pack.
- Arbitrary-address lookup, surveys, easement discovery, or independent confirmation of site facts.
- Full CAD/BIM, architectural documentation, structural engineering, building/fire-code review, energy modeling, flood or wind simulation.
- Permit submission, authority approval, permit issuance, or a complete application package.
- Accounts, cross-device synchronization, shared project storage, or production-readiness validation.

The Evidence view separates **demonstration assumptions** from **source-linked conditional thresholds**. The latter are traced to specific official code sections and calculated only under declared fictional R5 scenario facts. Real requirements have definitions, exceptions and additional conditions; this version does not establish complete compliance. Living area is never inferred from footprint and code height is never inferred from roof peak height.

## Source map

| Location | Responsibility |
| --- | --- |
| `src/components/SiteScene.tsx` | Three.js scene, plan, dragging, sun/shadow visuals. |
| `src/domain/fixtures.ts` | Fictional sites and sample assumptions. |
| `src/domain/engine.ts` | Validation, measurements, patching, repair search. |
| `src/domain/local-agent.ts` | Deterministic local commands. |
| `src/domain/packet.ts` | Escaped printable HTML and SVG. |
| `server/api.ts` | Meta connection and validated tool loop. |
| `server/intake.ts` | Bounded multimodal extraction with explicit user review. |
| `src/domain/portland.ts` | Source-linked conditional Portland checks and source metadata. |
| `src/domain/decisions.ts` | Measured comparison and priority selection. |
| `tests/` | Geometry, export, command and backend checks. |

References include Meta's [models](https://dev.meta.ai/docs/models), [tool calling](https://dev.meta.ai/docs/tool-calling), and [cookbook](https://github.com/meta-models/meta-model-cookbook); and Portland's [ADU zoning guide](https://www.portland.gov/ppd/zoning-land-use/zoning-code-overview/adu-zoning). The city link provides context, not proof that sample assumptions apply to a property.

## Hackathon provenance and next steps

This build began October 27, 2026, during the event. Application-specific workspace, geometry checks, repair behavior, provider integration, and export flow were developed for the prototype. Third-party dependencies and hosting starter material are not claimed as original work. An interface concept generated with Image Gen was a development reference, not a Meta runtime capability. The interactive building is application-generated geometry.

See [the demo and submission plan](docs/HACKATHON.md). Remaining gates are an activated Meta key, recorded live tool-loop evidence, professional review of the limited source subset, authenticated plan-intake acceptance, and a final three-minute video. The public repository identifies the event-created work.

## License

Original Schema code is provided under the [MIT license](LICENSE). Dependencies, starter material, and external resources retain their own licenses and terms. Fixtures are fictional; no property-owner records are included. Public access to a code document or architectural plan does not itself grant redistribution rights.
