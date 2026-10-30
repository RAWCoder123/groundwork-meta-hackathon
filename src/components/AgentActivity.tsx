"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, CirclePause, Clock3, History, ShieldCheck } from "lucide-react";
import { agentPresentation } from "../autonomy/presentation";
import type { AutoProject, IntegrationStatus } from "../autonomy/types";

const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function AgentActivity({ project, connections, onConnections }: {
  project: AutoProject;
  connections: IntegrationStatus;
  onConnections: () => void;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const state = agentPresentation(project, connections);
  const events = project.events.slice(-4).reverse();
  const registerNeedsReview = !!project.corrections && project.corrections.confirmedRevision !== project.corrections.revision;
  const target = registerNeedsReview ? "#sa-proposal" : project.status === "needs_input" ? "#sa-conversation" : "#sa-decisions";
  return <section className={`sa-agent-activity ${state.tone}`} aria-label="Agent activity" data-page-visible={visible}>
    <div className="sa-agent-presence" aria-hidden="true">
      {state.active ? <span className="sa-agent-signal"><i/><i/><i/></span> : state.tone === "review" ? <ShieldCheck size={22}/> : project.status === "paused" ? <CirclePause size={22}/> : <Clock3 size={22}/>}
    </div>
    <div className="sa-agent-state" role="status" aria-live="polite" aria-atomic="true">
      <strong>{state.title}</strong>
      <p>{state.detail}</p>
    </div>
    <div className="sa-agent-tools">
      {state.tone === "review" && <a className="sa-activity-action" href={target}>Review {registerNeedsReview ? "comment register" : project.status === "needs_input" ? "questions" : "checkpoint"}<ArrowUpRight size={15}/></a>}
      {state.tone === "attention" && <button className="sa-activity-action" onClick={onConnections}>Review connections<ArrowUpRight size={15}/></button>}
      <details className="sa-activity-history">
        <summary><History size={15}/><span>Recent activity</span><span className="sa-history-count">{events.length}</span></summary>
        <ol>{events.length ? events.map(event => <li key={event.id}><span className="sa-history-marker" aria-hidden="true"/><p>{event.type === "agent_tool" ? "Agent completed a checked project step." : event.type === "official_research" ? "Official source research recorded for review." : event.detail}</p><time dateTime={event.createdAt}>{time(event.createdAt)}</time></li>) : <li><p>No completed steps recorded yet.</p></li>}</ol>
      </details>
    </div>
  </section>;
}
