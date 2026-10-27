import { handleApi } from "./api";
// Generated at build time. No credentials or project data are embedded.
// @ts-expect-error generated module
import assets from "../build/assets.js";

export default {
  async fetch(
    request: Request,
    env: Record<string, string | undefined>,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed", { status: 405 });
    const asset =
      assets[url.pathname === "/" ? "/index.html" : url.pathname] ??
      (url.pathname.includes(".") ? null : assets["/index.html"]);
    if (!asset) return new Response("Not found", { status: 404 });
    return new Response(request.method === "HEAD" ? null : asset.body, {
      headers: {
        "Content-Type": asset.type,
        "Cache-Control": url.pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com https://*.openai.com",
      },
    });
  },
};
