# Schema submission package

Meta Global AI Developer Hackathon · Track: **Build for Your World** · Deadline from the supplied guide: **November 4, 2026, 9 PM Eastern**. Confirm against the current event page before submitting.

## One-line pitch

Schema is a commercial fit-out project agent. Give it a brief and PDFs; it develops the understanding, an editable 2D/3D concept, a permit strategy and a reviewed handoff, has an independent Meta review check its own drafts, and stops for the architect or contractor at every decision that matters.

## Team

| Contributor | GitHub | Role |
| --- | --- | --- |
| — | RAWCoder123 | Owner, product, implementation (fill in name) |
| — | amandula0803 | Teammate (fill in name and role) |
| — | vkbvkb744-wq | Teammate; proposed the generator/critic/synthesizer review loop |

Fill in names and roles before submitting. AI coding assistants (ChatGPT/Codex and Claude Code) were used during development; say so if the event form asks.

## Judge access

1. Open https://groundwork-adus.raymondaw2006.chatgpt.site/ (public Site; sign in with a ChatGPT account to get a private workspace).
2. On the welcome screen choose **Open example project** to see a populated workspace at its design checkpoint without waiting on the model. It is labeled as a prepared example.
3. Or choose **Use a fictional office brief** and **Start project** to watch the live agent work. Upload `public/fictional-office-brief.pdf` from the repository to include a document.
4. Source: https://github.com/RAWCoder123/groundwork-meta-hackathon

Before submitting, sign in from a second ChatGPT account and confirm steps 1–3 work for someone other than the owner.

## Three-minute video

Record against the published Site after the live run passes. Use real Meta output only; the prepared example may appear only where narrated as the example.

| Time | Screen | Narration (approximate) |
| --- | --- | --- |
| 0:00–0:15 | Welcome screen with the Schema mark | "Commercial fit-outs lose weeks to coordination: reading briefs, drafting options, chasing missing information. Schema is an agent that does that work and brings the architect only the decisions." |
| 0:15–0:35 | Paste the fictional brief, upload the PDF, start | "I give it a brief and the existing documents. Muse Spark reads the PDF pages directly; every fact keeps its page." |
| 0:35–0:60 | Activity band while working; understanding checkpoint | "It works on its own: inspecting the project, researching official Portland sources, drafting. Then it stops. I confirm what it understood before it designs anything." |
| 1:00–1:30 | Concept: floor plan ↔ 3D, edit a room | "One model drives the plan and the 3D view. Geometry checks run on every change. These are concepts for decisions, not permit drawings." |
| 1:30–1:55 | Independent review row on the proposal (a live run that drew blocking findings shows the revision best) | "Before any checkpoint, a second Meta request reviews the drafts: unsupported claims, invented facts, overstated authority. Blocking findings send the agent back to revise once; you see what was found and what changed." |
| 1:55–2:20 | Type layout feedback; earlier approval goes stale; revised concept | "I ask for a bigger meeting room by the entry. It revises, and the old approval is marked stale so nothing gets approved against outdated work." |
| 2:20–2:45 | Package checkpoint; Export handoff | "At the end it assembles a handoff with every unresolved responsibility, the sources and the review findings, bound to an exact project revision." |
| 2:45–3:00 | Close and reopen; saved progress | "Work is durable and bounded: budgets, saved provider state, and nothing external happens without approval. Schema never claims a permit, sign-off or city acceptance." |

Event-created features to name on screen or in the description: the workspace, the durable runner, PDF provenance, the linked concept views, the independent critic loop, approvals and stale detection, and the handoff export. Third-party components (Vinext/Sites starter, React, Three.js, PDF.js, Drizzle, Lucide) are not original work.

## Evidence

| Claim | Evidence | Status |
| --- | --- | --- |
| Tests, build and artifact validation | `npm test`, `npm run build`, `npm run validate` on the submitted commit | Run on the final commit |
| Live Meta document → tools → revision → handoff | `scripts/live-smoke.ts` → `docs/live-run-record*.json` (PR #3) | **Done locally**: three consecutive passing runs with a real key |
| Independent critic and revision loop | Controlled tests; live run 2 in PR #3 (4 blocking findings → handoff revised) | **Done**: controlled and live (local) |
| Hosted signed-in acceptance | Owner and a second account complete the judge steps | Pending |
| Unattended progress with the tab closed | Fresh stage advances after closing, read back on reopen | Pending; do not claim until observed |
| Email delivery, city submission, permit issuance | — | Not implemented or not claimed |

## Submission checklist

- [ ] PRs #1–#4 merged and the Site republished from `main`.
- [x] Live smoke run passes (three consecutive local runs; evidence in PR #3).
- [ ] Hosted run by the owner, plus a second account for judge access.
- [ ] Three-minute video recorded from real runs and uploaded with access for judges.
- [ ] Team names, roles and track entered on the event form.
- [ ] Submitted commit hash recorded here and in `docs/DEPLOYMENT-STATUS.md`.
