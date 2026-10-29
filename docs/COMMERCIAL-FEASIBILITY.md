# Schema: commercial permitting feasibility and execution

Research and implementation decision: October 29, 2026. Estimates below are engineering judgment, not measured delivery guarantees. City guidance and individual reviewer instructions can change.

## Decision

Proceed with a bounded commercial workflow: applicant-side **checksheet response coordination for an existing Portland, Oregon office tenant improvement**, on the standard Single PDF path. Start after the city has issued numbered review comments. Do not promise autonomous approval, complete code review, or faster government decision-making.

The full commercial permit lifecycle is very hard: it crosses land use, established occupancy, building and fire codes, existing-building conditions, trade permits, professionally prepared drawings, agency queues, payment, and inspections. A model can reduce preparation and coordination work without acquiring the city's legal authority. Generating plausible prose is the easy part; proving that each answer matches the correct current drawing is the hard part.

The strongest early buyer hypothesis is a commercial architect, permit coordinator/expeditor, or general contractor handling repeated office tenant improvements. It is a hypothesis to test with practitioners, not established demand. Selling directly to government is a separate route with procurement, security, integration, and accountability work. Do not require a municipal contract to test applicant value.

## What the actual process requires

1. Establish permitted existing conditions and project scope, including use/occupancy. Research approved, final permits rather than relying on a tenant's current operations. Identify the responsible design professional and relevant trades. [City alteration workflow](https://www.portland.gov/ppd/commercial-permitting/commercial-permit-inspections/commercial-tenant-improvement-alteration).
2. Prepare the scope-specific application and drawings. The city's matrix varies by ordinary alteration, use/occupancy change, and new construction/addition. Forms and separate mechanical/electrical/plumbing permits depend on the work. A document inventory does not prove compliance. [Application requirements](https://www.portland.gov/ppd/commercial-permitting/commercial-requirements).
3. Prescreen/intake, technical review, and pre-issuance are distinct stages. First review can produce corrections. The city's published review targets are goals, not guaranteed issuance dates; applicant response time must be measured separately. [Permit status and review stages](https://www.portland.gov/ppd/get-permit/check-permit-status).
4. Coordinate every checksheet item with a response and a plan location. Standard Single PDF corrections use changed plan pages plus the relevant checksheet/response and supporting documents. Facility Permit Program instructions differ and must not be mixed into this workflow. [Checksheet corrections](https://www.portland.gov/ppd/get-permit/checksheets), [FPP](https://www.portland.gov/ppd/commercial-permitting/facility-permit-program).
5. The applicant uses DevHub to upload correction PDFs and acknowledge authority. Upload windows depend on review status and any explicit technician permission. Prior corrections under review can prevent another upload. The additional-information field is not a substitute for uploaded checksheet responses. No authenticated public submission API was verified for this build. [DevHub corrections guide](https://www.portland.gov/ppd/upload-corrections-devhub).
6. Fees, city issuance, trade coordination, inspections, and final occupancy/closeout remain external steps. An exported Schema packet is not an issued permit or a complete drawing submission.

## Where automation is practical

| Capability | Difficulty | Current execution approach |
|---|---|---|
| Preserve numbered comments and assign response owners | Moderate | Reviewed comment register with original wording retained |
| Organize document versions and exact evidence excerpts | Moderate | Document register, sheet references, literal quote checks |
| Draft responses and identify missing evidence | Moderate | Meta tool loop grounded in current case; proposed changes only |
| Keep every issue open until human review and evidence checks | Moderate | Deterministic assessment independent of model prose |
| Prepare response matrix and handoff instructions | Moderate | Escaped printable HTML, suitable for review/print to PDF; actual plans still separate |
| Read arbitrary commercial plan sets reliably | Hard | Not implemented; current workflow uses pasted, reviewed excerpts |
| Interpret all applicable codes and make compliant design changes | Very hard | Licensed professional/city review; no automated certification |
| Submit and monitor DevHub end to end | Hard/external dependency | Human handoff; no credentials collected, no portal submission claimed |
| Guarantee fewer calendar days to issuance | Outside our control | Measure applicant minutes and review cycles separately |

Even a same-use, nonstructural office job can raise accessibility, seismic, energy, existing-conditions, or professional licensing questions. The city plans guide includes site size, height, structural/use changes, and official complexity/safety determinations; tenant floor area alone does not establish an exemption from a professional stamp. [Detailed-plan guidance](https://www.portland.gov/ppd/commercial-permitting/changing-commercial-space/prepare/create-detailed-plans).

New commercial building/mechanical applications from April 1, 2026 use the 2025 OSSC/OMSC according to the city's transition notice. Existing permits may have different vesting; some linked form labels reference older editions. The case therefore requires edition confirmation instead of silently choosing a code. Residential R5 assumptions from the earlier prototype are not applicable. [City code transition](https://www.portland.gov/ppd/commercial-permitting/news/2025/9/1/new-2025-oregon-structural-specialty-code-and-oregon).

## Product loop being built

- Open a fictional office TI corrections case, explicitly separate from the retained residential geometry study.
- Register the city's reviewer items and paste relevant plan excerpts with document IDs, sheet references, and revision identifiers. Current inputs are text, not verified complete PDFs.
- Ask Meta to inspect the case, run the independent readiness tool, and propose coordinated responses with evidence references. Tool execution is visible; no hardcoded answer is presented as live Meta inference.
- Reject invented quotations, nonexistent documents, and obsolete revisions. Keep unsupported scope and missing evidence as blockers. Applying a draft clears approval rather than resolving an issue automatically.
- Review each answer, attach missing evidence, and mark personal review. Export a response-coordination packet with the same case revision, sources, and unresolved items.
- Hand the reviewed material to the authorized applicant/design professional. Do not send it to city systems or mark any permit approved.

The demonstration intentionally includes a missing evidence item so the agent cannot succeed simply by writing a reassuring answer. A changed document revision invalidates previous review.

## Competition and YC relevance

The opportunity is real but crowded. [PermitFlow](https://www.permitflow.com/) already markets permitting automation and permit/redline tracking. [GreenLite](https://greenlite.com/about-greenlite/) combines AI and human permitting expertise. Schema must prove a specific coordination advantage; another generic permit chatbot or checklist has weak differentiation. Exact comment-to-revision evidence and measured applicant effort are the proposed test, not a proven moat.

YC's current [Requests for Startups](https://www.ycombinator.com/rfs), under “AI for City Hall,” explicitly invites permitting and related government workflow companies. This supports the user's observation about interest in laborious workflows. It does not prove Schema's demand, technical accuracy, procurement path, or funding prospects.

## How to execute beyond the demonstration

**This hackathon:** finish one source-backed synthetic correction cycle, live Meta tool execution, failure handling, evidence checks, and reviewable export. Keep a passing test suite, public source, event-created contribution log, and a three-minute video. Do not spend remaining time integrating many cities or building a complete commercial CAD system.

**Practitioner pilot:** recruit one architect or expeditor, obtain permission to use historical files, and label 10–20 completed correction rounds. Retain original comments, actual response packages, drawing revisions, and the practitioner's judgments. This is the first expensive uncertainty to resolve. Run a shadow workflow before any real submission.

**Operational pilot:** with the same practitioner, support a few live cases using human submission. Add full PDF extraction and reviewable page overlays only if needed for the measured bottleneck. Authenticate users and enforce project-level data isolation before shared real customer files; browser-local prototype storage is not a team records system.

**Integration expansion:** prove portal permissions, user authorization, failure recovery, receipts, and auditability before adding submission. Add another jurisdiction only after the first workflow performs well with real cases. Municipal-side review would require a separately agreed scope and city integration.

## Continue or pivot gates

These are proposed pilot acceptance targets, not results already achieved:

- Every reviewer item in the labelled set is represented; no silently dropped item or false completion.
- No invented evidence quotation, wrong document revision, or unsupported assertion is treated as verified.
- A professional can identify every source, unresolved issue, proposed response, and change owner.
- Median applicant preparation time falls by a useful amount (initial target: at least 30%) including human review overhead, compared with that practitioner's existing process.
- At least one practitioner wants to use the workflow again on a live case. Willingness to pay and case volume require direct validation.

Narrow or pivot if files cannot be shared, review takes as long as manual preparation, technical design dominates the work, or practitioners already solve this adequately with incumbent tools. A single positive demo does not clear those gates. Initial pilot targets may be revised after baseline measurement, before scoring product performance.

## Meta alignment and remaining acceptance

The [event](https://events.cerebralvalley.ai/e/meta-ai-developer-hackathon) invites domain applications (“Build for Your World”) and systems that improve interaction with the physical world. Commercial construction coordination fits the former directly; do not imply it is a validated engineering simulation. Meta [tool calling](https://dev.meta.ai/docs/tool-calling) supports a model choosing real functions and incorporating their outputs.

The supplied participant guide requires meaningful Meta-model use, public source, clear event-created work, rights to assets/data, a team of at most four, and a three-minute demo by November 4 at 9 p.m. Eastern. It lists basic RAG apps and simple image analyzers as anti-project examples. Our test is an action-and-verification loop with reviewed state changes and export, not a document Q&A screen. The exact final rubric table was not present in the pasted text; no weights are assumed.

The user reported a connected Meta account on October 28. That is not evidence that this new commercial tool loop has completed live. Authenticate and run it before recording; controlled-provider tests do not prove live model acceptance. Never reuse or publish the credential pasted into chat. Do not describe the private development URL as a judge-accessible submission until access has been arranged and verified.
