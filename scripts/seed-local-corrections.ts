import { writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fixtureFiles,
  fixturePdf,
  buildCorrectionFixture,
} from "../examples/correction-fixture";
const root = fileURLToPath(new URL("../", import.meta.url)),
  base = process.argv[2] ?? "http://127.0.0.1:5173";
if (new URL(base).hostname !== "127.0.0.1")
  throw new Error("This controlled seeder supports local preview only.");
const signIn = await fetch(base + "/signin-with-chatgpt?returnTo=%2F", {
    redirect: "manual",
  }),
  cookie = signIn.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Start the local development server first.");
const state = await (
  await fetch(base + "/api/autonomy/state", { headers: { Cookie: cookie } })
).json();
if (state.integrations?.metaConfigured)
  throw new Error(
    "Use a local fixture profile without a Meta key. Controlled seeding must not trigger live model requests.",
  );
const headers = {
  Cookie: cookie,
  Origin: base,
  "Content-Type": "application/json",
};
let response = await fetch(base + "/api/autonomy/projects", {
  method: "POST",
  headers,
  body: JSON.stringify({
    brief:
      "Controlled fictional correction evaluation. No real permitting or Meta result.",
    entryPoint: "corrections",
  }),
});
let p = (await response.json()).project;
if (!p) throw new Error("Local case creation failed.");
for (const item of fixtureFiles) {
  const bytes = fixturePdf(item.lines);
  let saved = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const form = new FormData();
    form.set("file", new File([bytes], item.name, { type: "application/pdf" }));
    response = await fetch(
      base + "/api/autonomy/projects/" + p.id + "/documents",
      { method: "POST", headers: { Cookie: cookie, Origin: base }, body: form },
    );
    if (response.ok) {
      p = (await response.json()).project;
      saved = true;
      break;
    }
    if (response.status !== 409) break;
  }
  if (!saved) throw new Error("Local fixture upload failed.");
}
const fixture = buildCorrectionFixture(p.ownerId, p.documents);
fixture.id = p.id;
const sql = (v: string) => "'" + v.replaceAll("'", "''") + "'",
  dir = mkdtempSync(join(tmpdir(), "schema-corrections-")),
  file = join(dir, "fixture.sql");
writeFileSync(
  file,
  `UPDATE auto_projects SET version=${fixture.version},state_json=${sql(JSON.stringify(fixture))},updated_at=${sql(fixture.updatedAt)} WHERE id=${sql(fixture.id)};`,
);
execFileSync(
  process.execPath,
  [
    "--import",
    join(root, "scripts/sites-env.mjs"),
    join(root, "node_modules/wrangler/bin/wrangler.js"),
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    join(root, "dist/server/wrangler.json"),
    "--persist-to",
    join(root, ".wrangler/state"),
    "--file",
    file,
  ],
  { cwd: root, stdio: "ignore" },
);
const share = structuredClone(fixture);
share.id = "fictional-correction-evaluation";
share.ownerId = "fictional-evaluator";
for (const doc of share.documents) {
  doc.objectKey = "examples/" + doc.name;
  delete doc.metaFileId;
}
writeFileSync(
  join(root, "examples/fictional-corrections.json"),
  JSON.stringify(
    {
      project: share,
      evaluation: {
        fixture: true,
        groundTruth: [
          {
            number: "1",
            discipline: "Building",
            page: 1,
            documentSha256: share.documents[0].sha256,
            wording: "Identify existing partitions.",
          },
          {
            number: "3(a)",
            discipline: "Building",
            page: 1,
            documentSha256: share.documents[0].sha256,
            wording: "Show the accessible route and door clearances.",
          },
          {
            number: "1",
            discipline: "Fire",
            page: 1,
            documentSha256: share.documents[0].sha256,
            wording: "Coordinate fire alarm documentation.",
          },
        ],
        practitionerWillingnessToReuse: null,
        practitionerConfirmedSemanticErrors: null,
        manualBaselineMinutes: null,
        applicantPreparationMinutes: null,
        humanReviewMinutes: null,
      },
    },
    null,
    2,
  ) + "\n",
);
for (const item of fixtureFiles)
  writeFileSync(join(root, "examples", item.name), fixturePdf(item.lines));
console.log(
  JSON.stringify({
    fixture: true,
    projectId: fixture.id,
    comments: fixture.corrections!.comments.length,
    files: fixture.documents.length,
  }),
);
