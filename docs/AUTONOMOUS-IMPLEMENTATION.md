# Schema commercial project agent

The main workspace has project conversation, current work and decisions. Both brief-led projects and existing-project corrections use owner-scoped D1 state, R2 originals/extractions/revision snapshots, artifact dependencies and approval records. The retained manual desk and residential study remain at `/legacy` and supply no commercial requirements.

## Coordination and authority

`src/autonomy/corrections.ts` owns the authoritative reviewer register, immutable page bindings, response fingerprints and completeness assessment. Only a user can confirm a register or review an exact response. Model tools can draft or revise; they cannot establish human review, city acceptance, professional competence or external authority. Response patches merge by internal comment ID so unrelated drafts and reviews survive. Independent checks send the model back to fill omitted register items with explicit unresolved responses before normal stage completion.

Source replacement preserves historical material and review records. Only reviews whose source, response, comment or declared concept dependency changed become obsolete. Exact SHA-256 fingerprints prevent a user click from approving a different response version. Original file downloads require project ownership and verify stored bytes against the source hash. Research records retain retrieval time, supporting draft claim, extracted excerpt, content hash and a private snapshot when available; search citations are labeled separately. Neither source retrieval nor quotation matching proves project-specific requirements.

## Independent critic

Before a stage reaches its checkpoint, a separate Meta request with no project tools reviews that stage's saved drafts. It looks for unsupported claims, invented facts, contradictions and overstated authority. Findings are stored on the project as `critiques` with the exact artifact revisions reviewed. A blocking finding sends the agent back for one revision round. The critique then records `revised` (with the new revisions) or `unaddressed`. The critic shares the stage's model and tool budgets, uses the same durable response polling and fail-opens to `unavailable` when its output is unreadable or the budget is spent. It never approves or blocks a checkpoint. The handoff export lists the latest critique for each stage. `SCHEMA_CRITIC=off` disables it.

## Durable execution

Fenced leases, persisted provider IDs/history, tool outcomes, event receipts, optimistic concurrency and immutable R2 snapshots protect resumed work. The runner can perform multiple bounded exchanges in one invocation and stops at approval/input gates. Authorized API actions also start a short server-owned batch with Cloudflare `waitUntil`; this is a bounded kick, not a perpetual worker.

The native recurring task is enabled hourly because the platform rejects five-minute scheduling. It can repeat bounded MCP batches rather than waiting another scheduler interval for each exchange. Queued time before the first execution is separate from the 60-minute attempt budget. Model calls, tool actions and retries remain bounded and duplicated deliveries remain fenced.

Pause/resume retains provider state and budgets. Saved-run recovery uses an atomic D1 project/job transition without resetting counts. An exhausted attempt requires a distinct explicit new-attempt action. Recovery is fenced by the exact recovery event so a concurrent context edit cannot revive an old provider job against new material. Failed initial Meta PDF transfers retain the readable original and are handed to bounded runner retry rather than leaving an unrecoverable file-only block.

## Live dependencies

A hosted server-only `MODEL_API_KEY` is still required for authenticated acceptance. Local private files are not hosted configuration. The Site MCP OAuth connection has been exercised successfully; the older private HTTP service-token test was not sufficient to assess this connection.

Hourly schedule creation and a subsequent persisted heartbeat have been observed. They do not prove closed-tab model completion. `SCHEMA_BACKGROUND_VERIFIED` remains false until a fresh authorized document/tool/revision stage progresses with the workspace closed and is read back afterward.

Gmail remains a tested provider interface; a native hosting adapter, eligibility and account consent remain unavailable. Sending is disabled without those prerequisites, and uncertain delivery requires reconciliation. Manual reviewed handoff remains available. No city portal submission is implemented.

## Verification

See `VERIFICATION.md`, `verification-record.json`, `DEPLOYMENT-STATUS.md`, and `PRACTITIONER-PILOT.md`. Controlled provider responses, local/browser tests, hosted observations and practitioner value are separate evidence classes. Fixtures are explicitly fictional. Application preference memory is editable persisted state, not model retraining or authority to act.
