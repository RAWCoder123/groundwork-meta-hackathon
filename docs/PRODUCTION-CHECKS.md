# Production continuation — October 30, 2026

The commercial agent runner now requires the Sites caller identity and selects only that caller’s projects. Public demo access is not authority over other users’ saved work. The project_status tool reads only the caller’s project state. retry_saved_work requires an explicit request and preserves the saved job, limits and approval gates; it cannot authorize a new bounded attempt, external action or release.

195 automated tests passed, including anonymous rejection, caller-scoped status and execution, cross-owner recovery rejection and rejection of a budget-reset argument. The official production build and artifact validation passed. Anonymous hosted MCP access returned HTTP 401 before this release. Native authenticated tool verification is recorded after publication.

Remaining acceptance: authenticated Meta document/tool/revision workflow, signed-in teammate browser testing, meaningful scheduled progress with the workspace closed, approved email delivery, practitioner validation and final video. These are not established by the build or connection-status flag.

## Hosted verification

Version 8 published successfully from `88e47636d2e66e94445e65fbc7dffd43cfc931d3`, using environment revision 7 and the existing public audience. The authenticated native runner status succeeded after publication and reported Meta configured and storage ready. Browser sign-in reached the OpenAI security verification page; signed-in project acceptance remains pending.
