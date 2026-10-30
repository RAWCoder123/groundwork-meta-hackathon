# Current product scope

Schema coordinates a Portland commercial office fit-out for architects, permit coordinators and contractors. The first measurable workflow is correction-response preparation. A project can start from a brief or from city review comments; both use the same documents, tasks, artifacts, approvals and handoff.

The corrections entry point does not require a new concept model. A brief-led project can still develop an editable shared 2D/3D concept. Declared dimensions, proposed rooms and unverified existing-condition notes are distinguished from professional measurements. Geometry checks cover boundaries, overlap and declared door placement only.

## Authoritative information

A human-confirmed register retains original reviewer numbering and wording, discipline, owner, source page, immutable content identity and nested relationships. Duplicate reviewer numbers remain separate internal records. Model response lists do not define how many comments exist.

Drafted, accounted for, supported by a source passage, reviewed by an applicant and accepted by a city are different states. A literal quotation is not semantic or engineering verification. The current implementation never labels a package submission-ready or a correction city-accepted. A coordination handoff may contain explicit outstanding work.

Responses bind document ID, revision, SHA-256 content identity and page. Source replacement retains historical files and review records, invalidates affected response reviews and package approvals, and preserves unrelated response reviews. An original source can be opened from its excerpt through an owner-protected endpoint that verifies file content identity.

## Supported bounds

- Eight PDF files per project, including retained revisions; 10 MB and 50 pages per file.
- Text extraction and page provenance. Scanned/unread and truncated extraction coverage stays visible; OCR is not claimed.
- At most 50 PDF page-images attached to one model request across files. Other files are represented by bounded text context and are not claimed visually verified.
- Up to 150 registered comments. Model output/context and execution limits may require narrower cases; storage capacity is not proof of complete extraction.
- Twelve model requests, 24 tool actions, two transient retries and 60 elapsed minutes from first execution per attempt. Queue wait before first execution does not consume that budget.
- Short request-triggered server batches and a restricted authenticated MCP batch runner. Native recurrence is hourly. A saved schedule or heartbeat does not establish completed closed-tab inference.

## External responsibilities

Professionally prepared drawings, code interpretation, legal occupancy, city filing, review acceptance, permit issuance, inspections and construction remain separately evidenced responsibilities. No extra jurisdiction, complete CAD/BIM, structural engineering or environmental simulation has been added. DevHub filing remains a reviewed manual handoff.

Email is optional. A tested mail-service interface enforces exact-content approval and provider receipts, but a live native Gmail adapter, eligibility and consent are not established. The core workflow must work without mail delivery.

All included cases are fictional. Real permitting value and time savings remain hypotheses until a practitioner evaluates authorized historical cases.
