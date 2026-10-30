# Autonomous Schema implementation

This version implements the approved project-agent direction for architects and contractors, starting with a fictional Portland office fit-out. Project records, job state, model response identifiers, approvals, preferences, and receipts are durable in D1; original PDFs, complete extraction records and immutable project/artifact revision snapshots are in R2. It preserves the original Site identity and private audience. The prior development study is retained at `/legacy`.

## Runtime and authority

The supported Vinext runtime packages append-only Drizzle migrations. Project APIs require the signed-in Site owner identity and check ownership; mutations require the same origin. The private MCP runner advances authorized stages but cannot approve or send external actions. Each stage is bounded by 12 model requests, 24 tool actions, 60 minutes and two transient retries. Leases, checkpoints, optimistic concurrency, tool receipts and state-size checks protect resumability. Pause/resume preserves saved provider state and execution budgets; a checkpoint cannot be bypassed by pausing it.

A server-only `MODEL_API_KEY` is required. The browser connection used by the earlier prototype is insufficient for unattended work. Keep secrets in the hosting environment or ignored local environment files; do not publish them in source, prompts, screenshots or archives.

Gmail remains unavailable unless hosting eligibility, a real request-scoped adapter, connection, and write consent have been independently verified. The mail service contains exact-content approval, a send claim, provider receipts, uncertainty handling and reconciliation; controlled-provider tests do not establish a live connected account. No autonomous city filing is claimed.

## Product behavior

Start with a brief and available PDFs. Agents prepare project understanding, commercial concepts and permit strategy, coordination work and a review handoff. They stop for consolidated questions and user checkpoints. Documents are untrusted evidence, never authority to execute instructions. Feedback requeues affected work. Concept changes invalidate dependent approvals rather than every unrelated decision.

Office concepts share one model across the SVG floor plan, Three.js cutaway, room edits and geometry validation. They are conceptual, not professional permit drawings. Residential R5 checks do not apply to them.

Preference records preserve provenance and scope. Deleted preferences retain a content-free suppression marker so later agent runs cannot resurrect them from historical decisions. These records are application memory, not model retraining or evidence of professional competence.

PDF intake supports eight files, each at most 10 MB and 50 pages. Original sources and full extracted page text are stored in R2. Missing/scanned or text exceeding the bounded D1 excerpt budget is explicitly flagged. Meta file receipts are distinct from verified extraction or drawing adequacy.

## Verification status

Use the test/build output and current handoff report for actual results. In particular, do not infer any of these from a successful build: authenticated Meta processing, hosted D1/R2 persistence, cloud-scheduled progress, Gmail delivery, city submission or permit issuance. Each requires separate observed acceptance.

## Share package

The source archive is intended for local review and implementation handoff. It excludes dependencies, build caches, local credentials, private project records, and Git authentication state. The live development Site remains private. To deploy an independent copy, create a separate Site and replace the hosting project identity through the supported Sites workflow; do not publish a fork over the original Site.
