# Teammate access and development

Demo: https://groundwork-adus.raymondaw2006.chatgpt.site/

Source: https://github.com/RAWCoder123/groundwork-meta-hackathon

The source is public. The deployed app is currently owner-private, and individual projects are scoped to their signed-in owner. A public repository does not grant app access, database administration, deployment rights, or access to someone else's project records.

## Three kinds of access

| Need | Access to arrange | What it permits |
| --- | --- | --- |
| Try the deployed demo | Invite the teammate's ChatGPT email as a Site viewer | Sign in and use their own project workspace |
| Improve the code and schema | Add their GitHub username as a repository collaborator with write permission; accept the invitation | Branch, commit and open pull requests |
| Administer hosted storage and releases | A supported Site editor role for a same-workspace account | Manage the Site through the permissions available to that editor; database access must be checked after acceptance |

External Site visitors can be invited to view this Site. The available editor tool supports same-workspace accounts; an external viewer invitation is not an editor or database grant. If an external teammate cannot receive supported hosting access, they can develop against their own local D1/R2 and submit a pull request for the owner to deploy. No production database password is distributed by this project.

The owner needs teammates' GitHub usernames and ChatGPT account emails before granting these permissions. Access is pending until invitations are accepted and each teammate successfully signs in. Verify a teammate can open the app, create and reopen a fictional project, and perform the intended repository or hosting action. Do not claim teammate access from the owner's successful session.

An app invitation does not enable co-editing the owner's existing permit case. Shared project membership and roles within the app are not implemented. Use separate fictional cases for testing; coordinate code through GitHub.

## Hosted database: directly checked October 30, 2026

The native Sites database overview returned binding `DB` with these tables:

- `auto_projects`
- `auto_jobs`
- `auto_preferences`
- `auto_receipts`
- `auto_runtime`

A read of `auto_runtime` returned a stored background timestamp of `2026-10-30T06:48:27.764Z`. This verifies a reachable hosted database and readable persisted state for the owner; it does not prove another account's access or a successful model stage. The database viewer is in the Site's settings. Native read tools are also available to an authorized account through Sites. Application APIs retain owner checks.

## Run a development database

Use Node.js 24. Clone the public repository, install locked dependencies and build:

```sh
git clone https://github.com/RAWCoder123/groundwork-meta-hackathon.git
cd groundwork-meta-hackathon
npm ci
cp .env.example .dev.vars
npm run build
```

On a **fresh local database**, apply both checked-in migrations in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_true_dazzler.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_panoramic_blue_blade.sql
```

Do not replay migrations already applied to an existing local database. Local setup and the two migrations were exercised against a fresh isolated D1 on October 30; all five application tables were read back. This test did not modify production storage.

Inspect local tables and start the workspace:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'auto_%' ORDER BY name"
npm run dev
```

Use the printed local address and local sign-in. To rehearse without a model key, keep `MODEL_API_KEY` empty and run `npx tsx scripts/seed-local-corrections.ts` in another terminal. The example is explicitly controlled fictional data. Real agent generation requires a fresh key configured privately; no key is included in source or the archive.

## Improve the schema

The SQL declarations are in [`db/schema.ts`](../db/schema.ts). Project, document, approval and agent state are typed in [`src/autonomy/types.ts`](../src/autonomy/types.ts) and stored in versioned JSON records. [`server/autonomy/repository.ts`](../server/autonomy/repository.ts) owns durable writes, optimistic version checks and leases. [`src/autonomy/corrections.ts`](../src/autonomy/corrections.ts) owns comment identities and evidence/review dependencies.

For a schema change, create a branch, edit the declarations, run `npm run db:generate`, inspect the appended SQL and metadata, and apply only the new local migration. Previously applied migrations and journal entries are immutable. Changes to JSON state also need compatible validation and meaningful tests; a SQL migration alone does not update that contract.

Before a pull request:

```sh
npm test
npm run build
npm run validate
```

Document any data migration and recovery implications. Use synthetic examples in the public repository. The owner publishes through the supported Sites workflow, which applies pending hosted schema migrations. A fork must obtain its own Site identity instead of publishing over the original `.openai/hosting.json` project ID.

The current deployed runtime is version 6. Live Meta acceptance, meaningful closed-tab advancement and native Gmail delivery remain separately unverified; see [deployment status](DEPLOYMENT-STATUS.md).

## October 30 access update

The live demo now has a public Site access policy (changed independently of the polish release). Teammates can open the demo URL; project records remain sign-in protected and owner-scoped. GitHub write invitations were sent to `amandula0803` and `vkbvkb744-wq`; each recipient must accept. No database administrator access or shared-case editing has been granted.
