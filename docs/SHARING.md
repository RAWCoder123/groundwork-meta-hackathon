# Sharing this project

The shareable ZIP contains source code, setup instructions, synthetic examples and verification evidence. It does not contain local environment files, API keys, private D1/R2 records, dependencies, or Git authentication state.

## Review the source

Use the public GitHub repository or extract the ZIP and inspect `source/`. Node.js 24 is recommended. Run `npm install`, copy `.env.example` to ignored `.dev.vars`, and configure your own Meta key privately. Run `npm test`, `npm run build`, and `npm run validate`.

For local storage, build once, then apply each migration listed in `drizzle/meta/_journal.json` in order using the documented local D1 command in the Sites Vinext starter. Both the dev server and local migrations use `.wrangler/state` and the generated `dist/server/wrangler.json`.

Example, run once per unapplied migration:

```
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_true_dazzler.sql
```

Repeat for later unapplied SQL files, including `0001_panoramic_blue_blade.sql`. Do not replay already applied migrations. `npm run dev` then starts the supported development preview; use its printed address and local sign-in. The Cloudflare development plugin reads the ignored `.dev.vars` file. To check the built Worker with the same private file, run `npm start -- --env-file .dev.vars`; the built preview has no mock sign-in.

## Use or deploy a copy

The live development Site is private; sharing this archive does not grant access to it. A new owner should create a separate Site using the supported Sites workflow, replace `.openai/hosting.json`'s project identity with their newly returned ID, and preserve the `DB`, `BUCKET`, and MCP declarations. Do not publish a fork over the original Site.

Configure hosted `MODEL_API_KEY` as a runtime secret. A browser tab key or local `.dev.vars` is not hosted configuration. Set up the five-minute cloud runner only after verifying the published MCP writer's authorized access. Test that a fresh unattended run advances a real authorized stage before marking background execution verified.

Email sending remains unavailable unless native eligibility, account consent and a real hosting adapter are verified. Use only synthetic or authorized project files. Municipal submission, professional sign-off, permit issuance and physical construction are separate externally verified outcomes.
