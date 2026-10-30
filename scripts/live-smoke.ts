// Live acceptance rehearsal against a local dev server with a real Meta key in
// the ignored .dev.vars. Drives brief → PDF → understanding → design → feedback
// revision → package → handoff export through the actual API and writes an
// evidence record. It never reads, prints or records the key.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Project = {
  id: string; version: number; stage: string; status: string; blockedReason?: string; questions: string[];
  artifacts: { kind: string; revision: number }[];
  decisions: { id: string; kind: string; status: string; artifactVersions: Record<string, number> }[];
  events: { type: string; detail: string; createdAt: string }[];
  documents: { name: string; pages: number; status: string; metaFileId?: string; warnings: string[] }[];
  critiques?: { stage: string; status: string; findings: { severity: string }[]; note?: string }[];
};

const root = fileURLToPath(new URL("../", import.meta.url));
const base = process.argv[2] ?? "http://127.0.0.1:5173";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("The live smoke run supports local preview only.");
const stageTimeoutMs = Number(process.env.SMOKE_STAGE_TIMEOUT_MS ?? 20 * 60_000);
const brief = "Fictional Portland office fit-out in a 60 by 40 foot rectangular suite with a 10 foot ceiling. Keep the existing office use, exterior and structure unchanged. Explore an open workspace, a meeting room, two quiet offices and shared circulation. Help me develop the concept and permit strategy, identify missing professional information and prepare a reviewed handoff. Existing permit history, technical compliance and site conditions are not verified.";
const feedback = "Enlarge the meeting room so it can seat ten and place it next to the suite entry. Keep both quiet offices.";
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const log = (line: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);

const signIn = await fetch(base + "/signin-with-chatgpt?returnTo=%2F", { redirect: "manual" });
const cookie = signIn.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Start the local development server first (npm run dev).");
const headers = { Cookie: cookie, Origin: base };
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(base + path, { ...init, headers: { ...headers, ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  if (!response.ok) throw Object.assign(new Error(`${init.method ?? "GET"} ${path} → ${response.status}: ${(await response.text()).slice(0, 300)}`), { status: response.status });
  return (response.headers.get("content-type")?.includes("json") ? response.json() : response.text()) as Promise<T>;
}
const post = <T>(path: string, data: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(data) });

const state = await api<{ integrations: { metaConfigured: boolean } }>("/api/autonomy/state");
if (!state.integrations.metaConfigured) throw new Error("No Meta key is configured. Add MODEL_API_KEY to the ignored .dev.vars and restart npm run dev.");

const record = { recordedAt: new Date().toISOString(), evidenceClass: "local live Meta run (fictional project)", base, model: "muse-spark-1.3", projectId: "", steps: [] as unknown[], critiques: [] as unknown[], decisions: [] as unknown[], packet: null as unknown, outcome: "incomplete", failure: null as string | null };
const out = (name: string) => root + "docs/" + name;
const save = () => writeFileSync(out("live-run-record.json"), JSON.stringify(record, null, 2) + "\n");
const bundle = async (id: string) => (await api<{ project: Project }>(`/api/autonomy/projects/${id}/bundle`)).project;

async function settle(id: string, label: string): Promise<Project> {
  const started = Date.now(); let lastStatus = "", seen = 0, answered = 0, p = await bundle(id);
  seen = p.events.length;
  while (Date.now() - started < stageTimeoutMs) {
    if (p.status === "running") { try { await post(`/api/autonomy/projects/${id}/advance`, {}); } catch (error) { if ((error as { status?: number }).status !== 409) throw error; } }
    p = await bundle(id);
    for (const event of p.events.slice(seen)) log(`  ${event.type}: ${event.detail.slice(0, 140)}`);
    seen = p.events.length;
    if (`${p.stage}/${p.status}` !== lastStatus) { lastStatus = `${p.stage}/${p.status}`; log(`${label}: ${lastStatus}`); }
    if (p.status === "blocked") throw new Error(`Blocked during ${label}: ${p.blockedReason}`);
    if (p.status === "needs_input") {
      if (++answered > 2) throw new Error(`Repeated questions during ${label}: ${p.questions.join(" | ")}`);
      log(`  questions: ${p.questions.join(" | ")}`);
      p = (await post<{ project: Project }>(`/api/autonomy/projects/${id}/message`, { text: "These facts are not available for this fictional rehearsal. Keep them as explicit unresolved items and continue." })).project;
      continue;
    }
    if (p.status === "needs_approval" || p.status === "awaiting_external") break;
    await sleep(3000);
  }
  if (!["needs_approval", "awaiting_external"].includes(p.status)) throw new Error(`${label} did not reach a checkpoint within ${stageTimeoutMs / 60000} minutes.`);
  const counts: Record<string, number> = {};
  for (const event of p.events) counts[event.type] = (counts[event.type] ?? 0) + 1;
  record.steps.push({ label, seconds: Math.round((Date.now() - started) / 1000), stage: p.stage, status: p.status, version: p.version, artifacts: Object.fromEntries(p.artifacts.map(a => [a.kind, a.revision])), eventCounts: counts });
  save();
  return p;
}
const pending = (p: Project, kind: string) => { const d = p.decisions.find(d => d.status === "pending" && d.kind === kind); if (!d) throw new Error(`No pending ${kind} checkpoint.`); return d; };
const decide = async (p: Project, kind: string) => (await post<{ project: Project }>(`/api/autonomy/projects/${p.id}/decisions/${pending(p, kind).id}`, { choice: "approve" })).project;

try {
  let p = (await post<{ project: Project }>("/api/autonomy/projects", { brief, entryPoint: "brief" })).project;
  record.projectId = p.id; log(`Project ${p.id} created`);
  const pdf = readFileSync(root + "public/fictional-office-brief.pdf");
  for (let attempt = 0; ; attempt++) {
    const form = new FormData(); form.set("file", new File([pdf], "fictional-office-brief.pdf", { type: "application/pdf" }));
    try { p = (await api<{ project: Project }>(`/api/autonomy/projects/${p.id}/documents`, { method: "POST", body: form })).project; break; }
    catch (error) { if ((error as { status?: number }).status !== 409 || attempt >= 4) throw error; await sleep(1000); }
  }
  log(`Uploaded ${p.documents.map(d => `${d.name} (${d.pages} pages, ${d.status})`).join(", ")}`);

  p = await settle(p.id, "understanding");
  p = await decide(p, "understanding");
  p = await settle(p.id, "design");
  const firstDesign = pending(p, "design"), conceptBefore = p.artifacts.find(a => a.kind === "concept")?.revision;
  p = (await post<{ project: Project }>(`/api/autonomy/projects/${p.id}/message`, { text: feedback })).project;
  log("Sent layout feedback");
  p = await settle(p.id, "design revision");
  const replaced = p.decisions.find(d => d.id === firstDesign.id)!, conceptAfter = p.artifacts.find(a => a.kind === "concept")?.revision;
  if (replaced.status === "pending") throw new Error("Feedback did not retire the earlier design checkpoint.");
  if (!conceptBefore || !conceptAfter || conceptAfter <= conceptBefore) throw new Error(`Concept revision did not advance (${conceptBefore} → ${conceptAfter}).`);
  record.decisions.push({ check: "feedback retires earlier design checkpoint", earlierStatus: replaced.status, conceptRevision: [conceptBefore, conceptAfter] });
  p = await decide(p, "design");
  p = await settle(p.id, "preparation and handoff");
  p = await decide(p, "package");
  p = await bundle(p.id);
  const packet = await api<string>(`/api/autonomy/projects/${p.id}/packet`);
  writeFileSync(out("live-run-handoff.html"), packet);
  record.packet = { bytes: packet.length, projectRevision: p.version, matchesRevision: packet.includes(`PROJECT REVISION ${p.version}`), includesIndependentReview: packet.includes("Independent review") };
  record.critiques = (p.critiques ?? []).map(c => ({ stage: c.stage, status: c.status, blocking: c.findings.filter(f => f.severity === "blocking").length, advisory: c.findings.filter(f => f.severity === "advisory").length, note: c.note }));
  record.decisions.push(...p.decisions.map(d => ({ kind: d.kind, status: d.status, artifactVersions: d.artifactVersions })));
  record.outcome = p.status === "awaiting_external" ? "passed" : `ended ${p.stage}/${p.status}`;
  log(`Finished: ${record.outcome}`);
} catch (error) {
  record.failure = error instanceof Error ? error.message : String(error);
  log(`FAILED: ${record.failure}`);
  process.exitCode = 1;
} finally {
  save();
  log(`Evidence: docs/live-run-record.json`);
}
