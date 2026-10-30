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
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const path = new URL(request.url).pathname;
    const runtime = env as unknown as AutoEnvironment;

    if (path.startsWith("/api/autonomy/")) {
      const response = handleAutonomyApi(request, runtime);
      if(request.method==='POST'&&!path.endsWith('/advance')) return response.then(async result=>{
        if(result.ok){try{const data=await result.clone().json() as {project?:{id:string;status:string}};if(data.project?.status==='running')ctx.waitUntil(pumpBatch(createRepository(runtime),runtime,{projectId:data.project.id,maxSteps:6,milliseconds:25000}).catch(()=>console.warn('Schema background batch was interrupted; its durable queue remains available for reconciliation.')));}catch{/* Durable queue remains authoritative. */}}
        return result;
      });
      return response;
    }

    if (path === "/mcp") return handleAutonomyMcp(request, runtime);

    const legacyEnv = { MODEL_API_KEY: typeof runtime.MODEL_API_KEY === "string" ? runtime.MODEL_API_KEY : undefined };
    if (path === "/api/intake") return handleIntake(request, legacyEnv);
    if (path === "/api/permits") return handlePermits(request, legacyEnv);

    // ==========================================
    // MULTI-AGENT DISCUSSION & LAWYER QUEUE ROUTE
    // ==========================================
    if (path === "/api/multi-agent-workflow" && request.method === 'POST') {
      try {
        const body = await request.json() as { inputPrompt?: string };
        const inputPrompt = body.inputPrompt;

        if (!inputPrompt) {
          return new Response(JSON.stringify({ error: "inputPrompt is required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // 1. Generator Agent (Initial blueprint/draft)
        const draftResponse = await runAgent(runtime, 'Generator', 
          `Draft an initial blueprint or compliance analysis for this case: ${inputPrompt}`
        );

        // 2. Critic Agent (Checks for simulation flaws or bureaucratic gaps)
        const critiqueResponse = await runAgent(runtime, 'Critic', 
          `Review this draft blueprint for legal, simulation, or bureaucratic errors and missing compliance steps:\n\n${draftResponse}`
        );

        // 3. Synthesizer Agent (Refines based on critique)
        const finalOutput = await runAgent(runtime, 'Synthesizer', 
          `Improve and finalize the draft based on the critic's feedback.\n\nOriginal Draft: ${draftResponse}\n\nCritic Feedback: ${critiqueResponse}`
        );

        // 4. Log to Supabase for the Private Lawyer Review Portal
        if (runtime.SUPABASE_URL && runtime.SUPABASE_ANON_KEY) {
          await fetch(`${runtime.SUPABASE_URL}/rest/v1/agent_cases`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': runtime.SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${runtime.SUPABASE_ANON_KEY}`,
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              user_input: inputPrompt,
              initial_draft: draftResponse,
              critic_feedback: critiqueResponse,
              final_output: finalOutput,
              status: 'pending_lawyer_review'
            })
          }).catch(err => console.error("Supabase logging failed:", err));
        }

        return new Response(JSON.stringify({
          success: true,
          workflow: {
            draft: draftResponse,
            critique: critiqueResponse,
            final: finalOutput
          }
        }), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || "Internal Error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (path.startsWith("/api/")) return handleApi(request, legacyEnv);

    let binding = ctx.props?.CONNECTORS;
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

// Helper to execute agent roles via Cloudflare AI binding
async function runAgent(runtime: AutoEnvironment, role: string, prompt: string): Promise<string> {
  const systemPrompts: Record<string, string> = {
    Generator: "You are an expert legal and simulation design generator agent. Be thorough and structured.",
    Critic: "You are a strict legal compliance critic agent. Point out vulnerabilities, flaws, or slow bureaucratic gaps.",
    Synthesizer: "You are a master synthesizer agent. Combine the initial draft and critical feedback into a polished, high-quality final execution plan."
  };

  // Uses Cloudflare Workers AI model binding from the environment
  const aiBinding = (runtime as any).AI;
  if (!aiBinding) {
    throw new Error("Cloudflare AI binding (AI) is missing from environment runtime.");
  }

  const response = await aiBinding.run('@cf/meta/llama-3-8b-instruct', {
    messages: [
      { role: 'system', content: systemPrompts[role] },
      { role: 'user', content: prompt }
    ]
  });

  return response.response;
}

export default worker;
