# Repeatable correction-package evaluation

Begin with one authorized historical Portland office correction case. Obtain permission for the checksheet, drawing revisions and associated responses before upload. Store private exports under ignored `evaluations/private/`; never commit real case material or credentials.

## Independent reference

Have a practitioner record every original comment independently of Schema's extraction: document SHA-256, page, original number, discipline and wording. Preserve repeated numbering and nested items. Compare this reference with the complete original files, including unread pages. A model confidence score cannot establish coverage.

Export a project JSON bundle and add an `evaluation` object. `groundTruth` is an independently reviewed array with `documentSha256`, `page`, `number`, `discipline` and `wording`. Optional observations are `applicantPreparationMinutes`, `humanReviewMinutes`, `manualBaselineMinutes`, `practitionerConfirmedSemanticErrors` and `practitionerWillingnessToReuse`. Leave unobserved values null.

Run:

```
npm run evaluate:corrections -- evaluations/private/case-a.json
```

The evaluator compares the reference as a multiset, retaining duplicate items. It reports missing/extra register items, response coverage, literal-reference errors, outdated revisions and unresolved work. It does not infer semantic support, engineering adequacy, time savings or customer willingness.

## Human measurement

Record preparation start/stop and review time, including corrections to extraction and verification of citations. Keep baseline work comparable in scope and participant experience. Ask the practitioner which passages actually support each claim; separately label literal matches that are misleading or technically incorrect. Record willingness to repeat the workflow only after observing use, with reasons.

Do not describe a coordination draft as submission-ready while evidence, responses or professional review remain unresolved. Record any later city acceptance from actual evidence, not from drafting or applicant approval.

## Fictional rehearsal

```
npm run evaluate:corrections -- examples/fictional-corrections.json
```

This deliberately reports two of three comments accounted for, an omitted Fire item, missing support and one outdated drawing reference. Reviewer number `1` appears in Building and Fire, and `3(a)` is preserved. Timings and practitioner feedback remain null.

For the browser rehearsal, first build/apply local migrations, start `npm run dev`, then run `npx tsx scripts/seed-local-corrections.ts`. The seeder supports loopback preview only, uploads three real text-bearing fictional PDFs and creates an explicitly controlled local case. It is not a live Meta demonstration.

Proceed to additional cases only after reviewing extraction coverage, unsupported claims, stale dependencies and the actual applicant workload. Passing software tests alone does not validate customer value.
