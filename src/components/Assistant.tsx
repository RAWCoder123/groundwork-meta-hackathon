import {
  ArrowUp,
  ArrowRight,
  Check,
  LoaderCircle,
  Sparkles,
  X,
} from "lucide-react";
import type { AgentResult, DesignPatch, Project } from "../domain/types";
export type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  mode?: "local" | "meta";
  steps?: AgentResult["steps"];
};
export type Proposal = {
  patch: DesignPatch;
  revision: number;
  messageId: number;
};
const labels: Record<string, string> = {
  width: "Width",
  depth: "Depth",
  height: "Height",
  x: "From west",
  z: "From front",
  roof: "Roof",
};
export function Assistant({
  project,
  messages,
  proposal,
  busy,
  mode,
  connected,
  onMode,
  onSend,
  onApply,
  onDismiss,
}: {
  project: Project;
  messages: Message[];
  proposal: Proposal | null;
  busy: boolean;
  mode: "local" | "meta";
  connected: boolean;
  onMode: (mode: "local" | "meta") => void;
  onSend: (message: string) => void;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <aside className="assistant panel">
      <div className="assistant-heading">
        <h2>Planning assistant</h2>
        <div className="assistant-status">
          <i className={mode === "meta" && connected ? "live" : ""} />
          {mode === "meta" ? "Meta connected" : "Local demonstration"}
          <span>
            · {mode === "meta" ? "Muse Spark 1.3" : "Meta disconnected"}
          </span>
        </div>
        <div className="mode-picker">
          <button
            className={mode === "local" ? "active" : ""}
            onClick={() => onMode("local")}
          >
            Local
          </button>
          <button
            className={mode === "meta" ? "active" : ""}
            onClick={() => onMode("meta")}
          >
            <Sparkles size={12} />
            Meta
          </button>
        </div>
      </div>
      <div className="messages" aria-live="polite">
        {messages.length === 0 ? (
          <>
            <div className="welcome-message">
              Tell me what you would like to change.
            </div>
            <p className="assistant-intro">
              Explore an idea. See what changes.
              <br />
              Keep the measurements connected.
            </p>
            <div className="suggestions">
              {[
                "Make it larger",
                "Move toward the boundary",
                "Find a better fit",
              ].map((text) => (
                <button
                  key={text}
                  disabled={busy}
                  onClick={() =>
                    onSend(
                      text === "Move toward the boundary"
                        ? "Move 14 ft west"
                        : text,
                    )
                  }
                >
                  {text}
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
            <div className="assistant-footnote">
              <span className="small-line" />
              <p>
                Local mode runs a small set of fixed commands. Connect Meta for
                natural-language assistance.
              </p>
            </div>
          </>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`message ${message.role}`}>
              <div className="message-label">
                {message.role === "user"
                  ? "You"
                  : message.mode === "meta"
                    ? "Muse Spark"
                    : "Local demonstration"}
              </div>
              <p>{message.text}</p>
              {message.steps && (
                <details className="tool-details">
                  <summary>{message.steps.length} recorded actions</summary>
                  <ol>
                    {message.steps.map((step, index) => (
                      <li key={index}>
                        <b>{step.tool.replaceAll("_", " ")}</b>
                        <p>{step.detail}</p>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              {proposal?.messageId === message.id && (
                <div className="proposal">
                  <strong>Proposed change</strong>
                  {Object.entries(proposal.patch).map(([key, value]) => (
                    <div className="proposal-row" key={key}>
                      <span>{labels[key]}</span>
                      <span>
                        {String(project.design[key as keyof DesignPatch])}
                        <ArrowRight size={11} />
                        <b>
                          {String(value)}
                          {key === "roof" ? "" : " ft"}
                        </b>
                      </span>
                    </div>
                  ))}
                  {proposal.revision !== project.revision ? (
                    <p className="proposal-stale">
                      The design has changed. Request a new proposal.
                    </p>
                  ) : (
                    <button
                      className="button primary apply-button"
                      onClick={onApply}
                    >
                      <Check size={14} />
                      Apply change
                    </button>
                  )}
                  <button className="dismiss-proposal" onClick={onDismiss}>
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ))
        )}
        {busy && (
          <div className="thinking">
            <LoaderCircle size={15} className="spin" />
            {mode === "meta"
              ? "Meta is checking the design…"
              : "Checking the sample geometry…"}
          </div>
        )}
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const input = form.elements.namedItem(
            "message",
          ) as HTMLTextAreaElement;
          if (input.value.trim()) {
            onSend(input.value.trim());
            input.value = "";
          }
        }}
      >
        <textarea
          name="message"
          aria-label="Describe a design change"
          placeholder="Describe a design change…"
          rows={2}
          maxLength={1200}
          disabled={busy}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          className="send-button"
          type="submit"
          disabled={busy}
          aria-label="Send design request"
        >
          {busy ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <ArrowUp size={20} />
          )}
        </button>
      </form>
    </aside>
  );
}
