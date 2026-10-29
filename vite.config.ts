import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { handleApi } from "./server/api";
import { handleIntake } from "./server/intake";
import { handlePermits } from "./server/permits";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
    plugins: [
      react(),
      {
        name: "groundwork-local-api",
        configureServer(server) {
          server.middlewares.use("/api", async (req, res) => {
            try {
              const chunks: Buffer[] = [];
              let bytes = 0;
              const limit =
                req.url?.split("?")[0] === "/intake" ? 5_700_000 : 100_000;
              for await (const chunk of req) {
                bytes += chunk.length;
                if (bytes > limit) {
                  res.writeHead(413);
                  res.end("Request too large");
                  return;
                }
                chunks.push(Buffer.from(chunk));
              }
              const origin = "http://" + (req.headers.host || "127.0.0.1:5173");
              const headers = new Headers();
              for (const [key, value] of Object.entries(req.headers))
                if (value)
                  headers.set(
                    key,
                    Array.isArray(value) ? value.join(", ") : value,
                  );
              const request = new Request(origin + "/api" + req.url, {
                method: req.method,
                headers,
                ...(req.method !== "GET" && req.method !== "HEAD"
                  ? { body: Buffer.concat(chunks) }
                  : {}),
              });
              const response =
                new URL(request.url).pathname === "/api/intake"
                  ? await handleIntake(request, env)
                  : new URL(request.url).pathname === "/api/permits"
                    ? await handlePermits(request, env)
                  : await handleApi(request, env);
              res.writeHead(
                response.status,
                Object.fromEntries(response.headers),
              );
              res.end(Buffer.from(await response.arrayBuffer()));
            } catch {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error: "The local server could not complete this request.",
                }),
              );
            }
          });
        },
      },
    ],
    build: { outDir: "build/client", emptyOutDir: true },
  };
});
