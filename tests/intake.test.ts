import test from "node:test";
import assert from "node:assert/strict";
import { handleIntake } from "../server/intake";
import { makeProject } from "../src/domain/fixtures";
const origin = "https://schema.example";
const key = "test-meta-key-not-real";
const bytes = Buffer.alloc(24);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
bytes.write("IHDR", 12);
bytes.writeUInt32BE(800, 16);
bytes.writeUInt32BE(1000, 20);
const file = {
  name: "site-plan.png",
  mime: "image/png",
  data: bytes.toString("base64"),
};
const result = {
  summary: "A dimensioned fictional site plan.",
  siteWidth: 50,
  siteDepth: 100,
  aduWidth: 24,
  aduDepth: 24,
  aduHeight: null,
  observations: ["ADU width: 24 feet; depth: 24 feet."],
  missingFacts: ["ADU height is not printed."],
};
function request(
  body: unknown = { file, project: makeProject() },
  headers: Record<string, string> = {},
) {
  return new Request(origin + "/api/intake", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "x-meta-api-key": key,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
async function mocked(fn: typeof fetch, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  globalThis.fetch = fn;
  try {
    await run();
  } finally {
    globalThis.fetch = previous;
  }
}
function provider(value: unknown = result) {
  return new Response(
    JSON.stringify({
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(value) } },
      ],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}
test("intake requires a key before transmitting any image", async () => {
  await mocked(
    async () => {
      assert.fail("No provider call without key");
    },
    async () => {
      const req = request();
      req.headers.delete("x-meta-api-key");
      const r = await handleIntake(req, {});
      assert.equal(r.status, 409);
      assert.match((await r.json()).error, /No image has been sent/);
    },
  );
});
test("intake rejects a cross-origin submission before provider access", async () => {
  const r = await handleIntake(
    request(undefined, { Origin: "https://elsewhere.example" }),
    {},
  );
  assert.equal(r.status, 403);
});
test("intake validates type, magic and image dimensions", async () => {
  await mocked(
    async () => {
      assert.fail("Invalid files cannot reach Meta");
    },
    async () => {
      for (const changed of [
        { ...file, mime: "application/pdf" },
        { ...file, data: Buffer.from("not an image").toString("base64") },
        { ...file, data: "%%%%" },
      ]) {
        const r = await handleIntake(
          request({ file: changed, project: makeProject() }),
          {},
        );
        assert.ok([400, 415].includes(r.status));
      }
      const oversized = Buffer.from(bytes);
      oversized.writeUInt32BE(20000, 16);
      const r = await handleIntake(
        request({
          file: { ...file, data: oversized.toString("base64") },
          project: makeProject(),
        }),
        {},
      );
      assert.equal(r.status, 400);
    },
  );
});
test("intake sends the image and schema to Meta without seeding fixture dimensions", async () => {
  const original = makeProject();
  await mocked(
    async (url, init) => {
      assert.equal(url, "https://api.meta.ai/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "muse-spark-1.3");
      assert.equal(body.response_format.type, "json_schema");
      assert.equal(
        body.messages[1].content[1].image_url.url,
        `data:image/png;base64,${file.data}`,
      );
      assert.ok(!JSON.stringify(body.messages).includes(original.name));
      return provider();
    },
    async () => {
      const r = await handleIntake(request({ file, project: original }), {});
      assert.equal(r.status, 200);
      const data = await r.json();
      assert.equal(data.mode, "meta");
      assert.deepEqual(data.extracted, result);
      assert.equal(data.extracted.aduHeight, null);
      assert.deepEqual(original, makeProject());
    },
  );
});
test("intake refuses invalid or incomplete extractions instead of guessing", async () => {
  for (const value of [
    { ...result, aduWidth: -20 },
    { ...result, aduDepth: "24" },
    { ...result, unexpected: true },
    { ...result, missingFacts: "none" },
  ]) {
    await mocked(
      async () => provider(value),
      async () => {
        const r = await handleIntake(request(), {});
        assert.equal(r.status, 502);
      },
    );
  }
  await mocked(
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "length",
              message: { content: JSON.stringify(result) },
            },
          ],
        }),
      ),
    async () => {
      const r = await handleIntake(request(), {});
      assert.equal(r.status, 502);
    },
  );
});
test("intake provider failures do not leak credentials or silently substitute local output", async () => {
  await mocked(
    async () => new Response(key, { status: 401 }),
    async () => {
      const r = await handleIntake(request(), {});
      assert.equal(r.status, 401);
      const text = await r.text();
      assert.ok(!text.includes(key));
      assert.ok(!text.includes('"mode":"local"'));
    },
  );
  await mocked(
    async () => provider({ ...result, summary: `Echo ${key}` }),
    async () => {
      const r = await handleIntake(request(), {});
      assert.equal(r.status, 200);
      assert.ok(!(await r.text()).includes(key));
    },
  );
});
