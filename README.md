# Schema

[Public source](https://github.com/RAWCoder123/groundwork-meta-hackathon) · [Setup and sharing](docs/SHARING.md) · [Implementation](docs/AUTONOMOUS-IMPLEMENTATION.md) · [Hackathon demo](docs/HACKATHON.md)

Schema is an autonomous commercial project workspace for architects and contractors, built for the Meta Global AI Developer Hackathon. Start with a brief and available PDFs; the agent develops understanding, a commercial concept and permit strategy, coordination work and a reviewed handoff. Users give feedback and approve meaningful decisions. The first case is a **fictional Portland office fit-out**. The first measurable workflow is responding to city review comments on an existing project, alongside the brief-led entry point.

The agent owns the internal work queue. The primary workspace has a project conversation, current proposal and decision queue. The earlier manual permit desk and residential study remain separately available at `/legacy`; their R5 rules are never used as commercial requirements. Existing Site and repository URLs retain the working name Groundwork.

## Implemented

- An authoritative, human-confirmed reviewer register, retained original numbering and nested items, exact response reviews, and independent omission/evidence/revision checks.
- Owner-scoped D1 project state, versioned artifacts, tasks, approvals, preferences, fenced jobs and tool receipts.
- R2 originals and complete page-text records. Intake supports eight text-bearing PDFs, each at most 10 MB and 50 pages. Unread or scanned pages stay visible.
- A single commercial concept model drives the editable floor plan and Three.js 3D cutaway. Geometry checks enforce declared boundaries and non-overlap.
- Meta Muse Spark 1.3 Responses, document inputs, search grounding and validated tools. Saved response IDs, checkpoints and outcomes support resumable work.
- Automatic internal progression, consolidated questions and dependency-bound understanding/design/package checkpoints. Feedback reopens affected work.
- Editable preference records with decision provenance and deletion suppression. This is application memory, not model retraining.
- Exact-content email approval, send claims, provider receipts and uncertain-outcome reconciliation behind a required eligible hosting adapter.
- Restricted private MCP batch runner, short server-owned initiation batches, and an enabled hourly cloud check. It cannot approve a decision, send a message or submit a permit.
- Standalone HTML handoff and project JSON exports.

Each stage stops at an approval gate, missing dependency, 12 model requests, 24 tool actions, 60 minutes or two transient retries. Pause/resume preserves the existing provider response and budgets.

## Integration status

Source implementation and live acceptance are separate. See [current scope](docs/SCOPE.md), [the practitioner evaluation](docs/PRACTITIONER-PILOT.md), [verification evidence](docs/VERIFICATION.md) and [hosted status](docs/DEPLOYMENT-STATUS.md).

- **Meta:** a privately configured hosted `MODEL_API_KEY` is required. The old tab-memory key cannot support unattended work. Authenticated document/tool/revision acceptance remains pending.
- **Background work:** native MCP read/write access is verified and an hourly schedule is enabled. The platform rejected five-minute cadence. Bounded exchanges run together rather than one per scheduler interval; meaningful closed-tab Meta completion remains unverified.
- **Gmail:** the provider interface is tested, but a native hosting adapter, eligibility, account consent and live delivery are unavailable. Email is optional; reviewed manual handoff works without it.
- **Permitting:** DevHub remains a reviewed handoff. Source citations do not establish site-specific compliance, professional sign-off, permit issuance or construction completion.

## Run locally

Use Node.js 24 and npm. The supported Sites Vinext runtime uses local Wrangler D1/R2 bindings.

```sh
npm install
cp .env.example .dev.vars
npm run build
```

Enter your own Meta key privately in ignored `.dev.vars`. Apply the local migrations once, as described in [setup](docs/SHARING.md), then run:

```sh
npm run dev
```

Open the printed address and use local preview sign-in. A local key is not hosted configuration. Do not commit credentials or place them in a `VITE_` variable.

```sh
npm test
npm run build
npm run validate
```

Build output is ignored. It includes a Vinext Worker, browser assets and append-only Drizzle migrations. Publishing is a separate step; forks must create their own Site identity instead of deploying over this development Site.

## Source map

| Location | Responsibility |
| --- | --- |
| `src/components/AgentWorkspace.tsx` | Conversation, proposal, decisions, intake and preferences |
| `src/components/OfficeConceptView.tsx` | Linked floor plan, 3D and room editing |
| `src/autonomy/corrections.ts` | Authoritative comments, immutable page evidence, review fingerprints and coverage |
| `src/autonomy/` | Project contract, dependency checks, approvals, concept validation and exports |
| `server/autonomy/runner.ts` | Meta continuation, checked tools, stage budgets and receipts |
| `server/autonomy/recovery.ts` | Atomic saved-run recovery and explicit new attempts |
| `server/autonomy/repository.ts` | Durable projects, fenced jobs and state size limits |
| `server/autonomy/documents.ts` | PDF extraction, page provenance, originals and Meta uploads |
| `server/autonomy/mail.ts` | Exact-action approval, provider abstraction and reconciliation |
| `server/autonomy/api.ts` | Owner isolation, project APIs and restricted MCP tools |
| `db/`, `drizzle/` | Append-only durable schema |
| `tests/` | Real SQLite/PDF checks and controlled-provider behavior |
| `docs/` | Scope, sharing, verification and demo requirements |

## Scope and provenance

Concepts are decision aids, not professionally prepared permit drawings. No complete CAD/BIM, certified code checking, structural analysis, validated environmental simulation, municipal filing, permit issuance or physical construction is claimed. Validate the workflow with a practitioner and authorized historical cases before claiming real permitting value.

Development began October 27, 2026. Application-specific work is identified in [the contribution and demo record](docs/HACKATHON.md) and public Git history. Third-party dependencies, hosting starter material and the earlier interface reference image are not original Meta runtime capabilities.

Original Schema code is provided under the [MIT license](LICENSE). Dependencies and starter material retain their own licenses. Examples are fictional; no private project records or credentials are included.
