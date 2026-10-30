import {pumpBatch} from '../server/autonomy/runner';
import {createRepository} from '../server/autonomy/repository';
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { handleAutonomyApi, handleAutonomyMcp } from "../server/autonomy/api";
import { handleApi } from "../server/api";
import { handleIntake } from "../server/intake";
import { handlePermits } from "../server/permits";
import type { AutoEnvironment } from "../src/autonomy/types";

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const path = new URL(request.url).pathname;
    const runtime = env as unknown as AutoEnvironment;
    if (path.startsWith("/api/autonomy/")) {
      const response=handleAutonomyApi(request,runtime);
      // A request starts a short server-owned batch; closing the tab does not
      // cancel it. Durable recurrence is a separate authenticated cloud runner.
      if(request.method==='POST'&&!path.endsWith('/advance'))return response.then(async result=>{
        if(result.ok){try{const data=await result.clone().json() as {project?:{id:string;status:string}};if(data.project?.status==='running')ctx.waitUntil(pumpBatch(createRepository(runtime),runtime,{projectId:data.project.id,maxSteps:6,milliseconds:25000}).catch(()=>console.warn('Schema background batch was interrupted; its durable queue remains available for reconciliation.')));}catch{/* The durable queue and visible errors remain authoritative. */}}
        return result;
      });
      return response;
    }
    if (path === "/mcp") return handleAutonomyMcp(request, runtime);
    const legacyEnv = { MODEL_API_KEY: typeof runtime.MODEL_API_KEY === "string" ? runtime.MODEL_API_KEY : undefined };
    if (path === "/api/intake") return handleIntake(request, legacyEnv);
    if (path === "/api/permits") return handlePermits(request, legacyEnv);
    if (path.startsWith("/api/")) return handleApi(request, legacyEnv);
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
};

export default worker;
