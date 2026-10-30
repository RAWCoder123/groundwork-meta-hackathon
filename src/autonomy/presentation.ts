import type { AutoProject, IntegrationStatus } from "./types";

const stageWork = {
  understanding: "Reading the brief and project files",
  design: "Developing the concept and permit strategy",
  preparation: "Preparing the coordination package",
  handoff: "Preparing the reviewed handoff",
};

/** Presentation follows saved state. A configured timer is not proof of work. */
export function agentPresentation(project: AutoProject, connections: IntegrationStatus) {
  const pending = project.decisions.find(d => d.status === "pending" && d.kind !== "external");
  const registerNeedsReview = !!project.corrections && project.corrections.confirmedRevision !== project.corrections.revision;
  if (project.status === "paused") return {
    tone: "quiet", active: false, title: "Paused by you",
    detail: "Your work is saved. Resume when you’re ready; the current run keeps its progress and limits.",
  } as const;
  if (project.status === "blocked") return {
    tone: "attention", active: false, title: "Attention needed",
    detail: project.blockedReason || "Review the saved progress and resolve the blocker before continuing.",
  } as const;
  if (project.status === "needs_approval" || registerNeedsReview) return {
    tone: "review", active: false,
    title: registerNeedsReview ? "The comment register needs your review" : pending?.title || "Your review is needed",
    detail: "Schema is waiting at a checkpoint. Review the current work before the next stage continues.",
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
