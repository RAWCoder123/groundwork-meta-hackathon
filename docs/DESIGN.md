# Schema workspace design

The primary surface is an operational commercial project workspace, not a marketing page. Preserve the established porcelain, graphite and olive identity. Conversation, current work and meaningful decisions remain connected; correction coordination leads when a case starts with review comments.

## Current hierarchy

- Project name, saved revision, stage and explicit current status stay visible.
- Correction coverage is stated against the confirmed register, with repeated numbering, missing responses, missing support and obsolete drawings shown plainly.
- Original comments and current drafts remain separate. An applicant review binds the exact response and source versions displayed; city acceptance is never implied.
- Source excerpts expand beside a response and link to a protected original PDF page. Historical files remain accessible and identified.
- Extracted fields can be corrected through labeled controls. Internal storage IDs, evidence matching forms and underlying JSON are not the normal workflow.
- Concept design supports the brief-led path. Existing-project corrections can proceed without inventing a new design. The same model drives floor plan and 3D; suite inputs are declared, rooms proposed and professional measurements unverified.
- Recovery distinguishes retrying saved work, pause/resume and explicitly starting a new bounded attempt. Email is optional.

## Visual system

Canvas `#f3f4ef`, white surfaces, graphite `#29342c`, primary olive `#44543c`, fine borders `#dfe3d9`. The correction surface uses readable 14px body text, 20px section headings and 16px reviewer-item headings, with 44px primary controls. Conversation and proposal body text use 14px. Primary controls use 42–44px targets; secondary chrome stays compact. Focus, selection and caret colors follow the olive palette. Use distinct wording and icons as well as color for status.

The desktop workspace uses three connected columns. Below 1150px the workspace uses two columns; below 800px it stacks in DOM order with panel jump links. The project selector truncates long names without widening the viewport. Browser verification records identify actual observed viewports; source media queries alone are not proof of mobile acceptance.

`corrections-controlled-ui.png` is a controlled local fixture showing repeated reviewer numbering, one omitted response, missing support and a replaced drawing. It is not live Meta evidence. `autonomy-controlled-ui.png` preserves the earlier conceptual design fixture. `design-concept.png` is the original development reference image, not the current product or a Meta runtime capability.

The retained `/legacy` manual permit desk and residential study have separate domain models. Their R5 demonstration rules are not commercial requirements and should not shape the commercial interface's claims.

## Calm architectural studio polish

A state-derived activity band names what needs attention, what Schema is working on, or which checkpoint is waiting. Its recent activity list uses persisted events, with neutral markers rather than implying every event is a success. No timer, heartbeat or missing Meta key produces a working animation. Three restrained bars move only while the saved state is runnable and the page is visible; reduced motion disables them.

The conversation, current proposal and decision queue use flatter internal rows, readable spacing and quiet dividers. Recovery actions expand beneath the activity band. Correction checks collapse into a labeled disclosure while comment coverage and each response's review status stay visible. Confirmed active preferences can be opened directly from the conversation.

Proposal tabs expose selection; the main region has a skip link. The 2D/3D concept shares the same model and has larger controls and a responsive canvas. Browser checks at 1280, 390 and 320 CSS pixels verified the actual viewport and page width, with no horizontal page overflow. `polish-desktop-concept.jpg` and `polish-mobile-concept.jpg` show a deterministic local fictional fixture, not live Meta or permit evidence.

## Mark, example project and independent review

The Schema mark (`src/components/SchemaMark.tsx`, `public/icon.svg`, `docs/schema-mark.svg`) is two interlocking isometric blocks forming an S on a 30° grid. It renders in graphite (`--sa-ink`) beside the wordmark and on the welcome screen, and serves as the favicon.

The welcome screen offers **Open example project**: a prepared, clearly labeled fictional office at its design checkpoint, built with the application's own domain operations. It contains no Meta output, critique or research retrieval, and its conversation states that no Meta request was made. Feedback on it starts real agent work.

The current proposal shows an **Independent review** row beneath each part the critic reviewed: status in words and an icon, reviewed and revised revisions, and blocking/advisory findings with the quoted claim. It is labeled review input, not approval. The activity band names the review outcome at a checkpoint and gives known runner blockers plain-language titles ("Connect Meta to continue", "This run reached its limit"); the saved reason stays in project details.

`demo-welcome.png` shows the welcome screen. `demo-example-review-controlled.png` shows the example project with a locally injected critique to exercise the review row; it is not live Meta output. Both were captured at 1280 CSS pixels, and the review row was also checked at 390 pixels with no horizontal overflow.
