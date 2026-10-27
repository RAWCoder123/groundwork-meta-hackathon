import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  rm,
  copyFile,
} from "node:fs/promises";
import { join } from "node:path";
import { build } from "esbuild";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
const assets = {};
async function walk(dir, prefix = "") {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name),
      key = prefix + "/" + item.name;
    if (item.isDirectory()) await walk(path, key);
    else {
      const ext = item.name.slice(item.name.lastIndexOf("."));
      assets[key] = {
        body: await readFile(path, "utf8"),
        type: types[ext] || "text/plain",
      };
    }
  }
}
await walk("build/client");
await writeFile(
  "build/assets.js",
  "export default " + JSON.stringify(assets) + ";",
);
await rm("dist", { recursive: true, force: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await build({
  entryPoints: ["server/worker.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
});
await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
console.log("Packaged Groundwork Worker with embedded browser assets.");
