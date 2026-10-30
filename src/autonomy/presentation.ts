import type { AutoProject, IntegrationStatus } from "./types";

const stageWork = {
  understanding: "Reading the brief and project files",
  design: "Developing the concept and permit strategy",
  preparation: "Preparing the coordination package",
  handoff: "Preparing the reviewed handoff",
};

// Known runner blockers get a plain-language title; the saved reason stays in project details.
const blockers = [
  { match: /server Meta connection|MODEL_API_KEY/, title: "Connect Meta to continue", detail: "Your project is saved. Add the server Meta key, then retry saved work." },
  { match: /time or execution limit|tool execution limit|model context request limit/, title: "This run reached its limit", detail: "Saved work is kept. Review progress, then start a new bounded attempt if needed." },
  { match: /temporarily unavailable|could not be reached|rate limited/, title: "Meta is temporarily unavailable", detail: "Saved work is kept. Retry saved work when you’re ready." },
];
const reviewLabels = { clear: "no misleading claims found", revised: "Schema revised its drafts in response", revision_requested: "a revision is in progress", unaddressed: "findings remain unaddressed", unavailable: "it did not run for this stage" } as const;
function reviewSummary(project: AutoProject) {
  const critique = [...(project.critiques ?? [])].reverse().find(c => c.stage === project.stage);
  return critique ? ` Independent review: ${reviewLabels[critique.status]}.` : "";
}

/** Presentation follows saved state. A configured timer is not proof of work. */
export function agentPresentation(project: AutoProject, connections: IntegrationStatus) {
  const pending = project.decisions.find(d => d.status === "pending" && d.kind !== "external");
  const registerNeedsReview = !!project.corrections && project.corrections.confirmedRevision !== project.corrections.revision;
  if (project.status === "paused") return {
    tone: "quiet", active: false, title: "Paused by you",
    detail: "Your work is saved. Resume when you’re ready; the current run keeps its progress and limits.",
  } as const;
  if (project.status === "blocked") {
    const reason = project.blockedReason ?? "";
    const known = blockers.find(b => b.match.test(reason));
    return {
      tone: "attention", active: false, title: known?.title ?? "Attention needed",
      detail: known?.detail ?? (reason || "Review the saved progress and resolve the blocker before continuing."),
    } as const;
  }
  if (project.status === "needs_approval" || registerNeedsReview) return {
    tone: "review", active: false,
    title: registerNeedsReview ? "The comment register needs your review" : pending?.title || "Your review is needed",
    detail: `Schema is waiting at a checkpoint. Review the current work before the next stage continues.${reviewSummary(project)}`,
  } as const;
  if (project.status === "needs_input") return {
    tone: "review", active: false, title: "A few answers are needed",
    detail: "Your questions are collected in the conversation. Answer together so Schema can continue.",
  } as const;
  if (project.status === "awaiting_external") return {
    tone: "quiet", active: false, title: "Awaiting external evidence",
    detail: "Handoff recorded. Submission, issuance, and construction require external evidence.",
  } as const;
  if (!connections.storageReady || !connections.metaConfigured) return {
    tone: "attention", active: false, title: "Connection setup is needed",
    detail: !connections.storageReady ? "Project storage is not ready. Review connections before continuing." : "A secure server Meta key is required before the agent can run. Your project is saved.",
  } as const;
  return {
    tone: "working", active: true, title: "Agent working",
    detail: project.tasks.find(t => t.stage === project.stage && t.status === "working")?.title || stageWork[project.stage],
  } as const;
}
