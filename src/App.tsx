import { useEffect, useMemo, useRef, useState } from "react";
import {
  House,
  FileDown,
  Link,
  X,
  Undo2,
  CircleAlert,
  Check,
  LoaderCircle,
  Clock3,
  ArrowRight,
  Download,
  Upload,
  ChevronDown,
} from "lucide-react";
import { makeProject, SITES } from "./domain/fixtures";
import { applyPatch, checkProject, validateDesign } from "./domain/engine";
import { buildPacket } from "./domain/packet";
import type { AgentResult, DesignPatch, Project } from "./domain/types";
import { Inspector } from "./components/Inspector";
import { SiteScene } from "./components/SiteScene";
import { Evidence } from "./components/Evidence";
import { PlanIntake } from "./components/PlanIntake";
import { CompareDesigns } from "./components/CompareDesigns";
import { PermitDesk } from "./components/PermitDesk";
import { Assistant, type Message, type Proposal } from "./components/Assistant";

type Activity = { id: number; time: string; title: string; detail: string };
const STORAGE = "groundwork.project.v1";
function initialProject(): Project {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (
      raw &&
      SITES.some((s) => s.id === raw.site?.id) &&
      Number.isSafeInteger(raw.revision) &&
      raw.revision > 0
    ) {
      const base = makeProject(raw.site.id);
      return {
        ...base,
        name: String(raw.name).slice(0, 80),
        design: validateDesign(raw.design),
        revision: raw.revision,
      };
    }
  } catch {}
  return makeProject();
}
function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [project, setProject] = useState(initialProject),
    [tab, setTab] = useState<"permits" | "design" | "compare" | "evidence" | "activity">(
      "permits",
    ),
    [view, setView] = useState<"3d" | "plan">("3d");
  const [hour, setHour] = useState(15),
    [month, setMonth] = useState(6),
    [messages, setMessages] = useState<Message[]>([]),
    [proposal, setProposal] = useState<Proposal | null>(null),
    [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<Activity[]>([]),
    [history, setHistory] = useState<Project[]>([]),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState(false),
    [intakeOpen, setIntakeOpen] = useState(false),
    [apiKey, setApiKey] = useState(""),
    [draftKey, setDraftKey] = useState(""),
    [serverConfigured, setServerConfigured] = useState(false),
    [verified, setVerified] = useState(false),
    [connecting, setConnecting] = useState(false),
    [connectError, setConnectError] = useState(""),
    [mode, setMode] = useState<"local" | "meta">("local");
  const projectRef = useRef(project),
    nextId = useRef(0),
    importRef = useRef<HTMLInputElement>(null),
    modalRef = useRef<HTMLDialogElement>(null);
  const checks = useMemo(() => checkProject(project), [project]);
  const failed = checks.filter((c) => c.outcome === "fail").length,
    review = checks.filter((c) => c.outcome === "review").length;
  const connected = verified;
  const log = (title: string, detail: string) =>
    setActivity((items) =>
      [
        {
          id: ++nextId.current,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          title,
          detail,
        },
        ...items,
      ].slice(0, 80),
    );
  useEffect(() => {
    projectRef.current = project;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(project));
    } catch {}
  }, [project]);
  useEffect(() => {
    fetch("/api/meta/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.configured) setServerConfigured(true);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (modal) modalRef.current?.showModal();
    else modalRef.current?.close();
  }, [modal]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  function update(patch: DesignPatch, title = "Design updated") {
    try {
      const current = projectRef.current,
        next = applyPatch(current, patch);
      projectRef.current = next;
      setHistory((h) => [...h.slice(-29), current]);
      setProject(next);
      log(
        title,
        `Revision ${next.revision} · ${Object.entries(patch)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")}`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "That change is outside the supported limits.",
      );
    }
  }
  function switchSite(id: string) {
    const next = {
      ...makeProject(id),
      revision: projectRef.current.revision + 1,
    };
    setHistory((h) => [...h.slice(-29), projectRef.current]);
    projectRef.current = next;
    setProject(next);
    setProposal(null);
    log("Site changed", next.site.name);
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    const next = { ...previous, revision: projectRef.current.revision + 1 };
    setHistory((h) => h.slice(0, -1));
    projectRef.current = next;
    setProject(next);
    setProposal(null);
    log("Previous design restored", `Revision ${next.revision}`);
  }
  async function send(message: string) {
    if (busy) return;
    setProposal(null);
    setBusy(true);
    const base = projectRef.current;
    setMessages((m) => [
      ...m,
      { id: ++nextId.current, role: "user", text: message },
    ]);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "x-meta-api-key": apiKey } : {}),
        },
        body: JSON.stringify({ project: base, message, mode }),
      });
      const result = (await response.json()) as AgentResult & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          result.error || "The assistant could not complete this request.",
        );
      const id = ++nextId.current;
      setMessages((m) => [
        ...m,
        {
          id,
          role: "assistant",
          text: result.message,
          mode: result.mode,
          steps: result.steps,
        },
      ]);
      if (result.patch)
        setProposal({
          patch: result.patch,
          revision: base.revision,
          messageId: id,
        });
      log(
        result.mode === "meta"
          ? "Meta proposal received"
          : "Local command checked",
        `${result.steps.length} recorded tool actions; no change applied yet.`,
      );
    } catch (error) {
      const text =
        error instanceof Error
          ? error.message
          : "The request failed. Please try again.";
      setMessages((m) => [
        ...m,
        { id: ++nextId.current, role: "assistant", text, mode },
      ]);
      log("Assistant request failed", text);
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    setConnecting(true);
    setConnectError("");
    try {
      const response = await fetch("/api/meta/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(draftKey ? { "x-meta-api-key": draftKey } : {}),
        },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to connect to Meta.");
      setApiKey(draftKey);
      setVerified(true);
      setDraftKey("");
      setMode("meta");
      setModal(false);
      setNotice("Meta connected. New assistant requests will use Muse Spark.");
      log("Meta connected", "Muse Spark 1.3 · live model access verified");
    } catch (error) {
      setConnectError(
        error instanceof Error ? error.message : "Meta could not be connected.",
      );
    } finally {
      setConnecting(false);
    }
  }
  function exportPacket() {
    download(
      `groundwork-${project.site.id}-revision-${project.revision}.html`,
      buildPacket(project),
      "text/html;charset=utf-8",
    );
    log(
      "Planning packet exported",
      `Revision ${project.revision} · current design, findings and source context`,
    );
    setNotice("Planning packet downloaded. Open it to print or save as PDF.");
  }
  async function importProject(file: File) {
    try {
      if (file.size > 30000)
        throw new Error("Use a Schema project file smaller than 30 KB.");
      const parsed = JSON.parse(await file.text());
      const id = parsed.site?.id;
      const base = makeProject(id);
      if (!SITES.some((s) => s.id === id))
        throw new Error(
          "This version supports the three included demonstration sites.",
        );
      const next = {
        ...base,
        name:
          typeof parsed.name === "string"
            ? parsed.name.slice(0, 80)
            : base.name,
        design: validateDesign(parsed.design),
        revision: projectRef.current.revision + 1,
      };
      setHistory((h) => [...h.slice(-29), projectRef.current]);
      projectRef.current = next;
      setProject(next);
      setProposal(null);
      log("Project imported", `Restored ${next.site.name}`);
      setNotice("Project restored.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not read this project file.",
      );
    }
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <a href="/" className="brand" aria-label="Schema home">
          <House size={27} strokeWidth={1.6} />
          <span>Schema</span>
        </a>
        <div className="project-name">
          {tab === "permits" ? "Commercial permit desk" : "Residential design study"}<small>Saved on this device</small>
        </div>
        <nav aria-label="Workspace views">
          {(["permits", "design", "compare", "evidence", "activity"] as const).map(
            (item) => (
              <button
                key={item}
                className={tab === item ? "active" : ""}
                onClick={() => setTab(item)}
              >
                {item === "permits" ? "Permit desk" : item[0].toUpperCase() + item.slice(1)}
              </button>
            ),
          )}
        </nav>
        <div className="header-actions">
          <button
            aria-label={connected ? "Meta connected" : "Connect Meta"}
            className={`button connection-button ${connected ? "connected" : ""}`}
            onClick={() => {
              setConnectError("");
              setModal(true);
            }}
          >
            <Link size={16} />
            <span>{connected ? "Meta connected" : "Connect Meta"}</span>
          </button>
          {tab !== "permits" && <button className="button primary" onClick={exportPacket}>
            <FileDown size={16} />
            <span>Export packet</span>
          </button>}
        </div>
      </header>
      <div className="scope-bar">
        <CircleAlert size={13} />
        <span>
          {tab === "permits" ? "Commercial office TI · Fictional corrections case · Applicant coordination, not city approval." : "Residential demonstration site · Planning assumptions, not a permit determination."}
        </span>
        {tab !== "permits" && <button onClick={() => setTab("evidence")}>
          View scope
          <ArrowRight size={12} />
        </button>}
      </div>
      {tab === "permits" ? <main className="permit-workspace"><PermitDesk apiKey={apiKey} connected={connected} onConnect={() => setModal(true)} /></main> : <main className={`workspace view-${tab}`}>
        <Inspector
          project={project}
          checks={checks}
          onChange={update}
          onSite={switchSite}
          onEvidence={() => setTab("evidence")}
          onIntake={() => setIntakeOpen(true)}
          onReset={() => {
            const next = {
              ...makeProject(project.site.id),
              revision: project.revision + 1,
            };
            setHistory((h) => [...h.slice(-29), project]);
            projectRef.current = next;
            setProject(next);
            setProposal(null);
            log(
              "Design reset",
              "Restored the selected site’s original dimensions.",
            );
          }}
        />
        <section className="work-area">
          {tab === "design" ? (
            <>
              <div className="canvas-shell">
                <div className="canvas-toolbar">
                  <div className="segmented view-picker">
                    <button
                      className={view === "3d" ? "selected" : ""}
                      onClick={() => setView("3d")}
                    >
                      3D
                    </button>
                    <button
                      className={view === "plan" ? "selected" : ""}
                      onClick={() => setView("plan")}
                    >
                      Plan
                    </button>
                  </div>
                  <div className="canvas-actions">
                    <span className={failed ? "has-failures" : ""}>
                      {failed
                        ? `${failed} outside sample limits`
                        : `${checks.length - review} checks within limits`}
                      <i>·</i>
                      {review} to review
                    </span>
                    <button
                      className="icon-button"
                      disabled={!history.length}
                      title="Undo last design change"
                      aria-label="Undo last design change"
                      onClick={undo}
                    >
                      <Undo2 size={17} />
                    </button>
                  </div>
                </div>
                <SiteScene
                  project={project}
                  checks={checks}
                  view={view}
                  hour={hour}
                  month={month}
                  onMove={(patch) => update(patch, "ADU moved on site")}
                />
                <div className="canvas-caption">
                  <span>
                    Drag the ADU to move · Drag ground to orbit · Scroll to zoom
                  </span>
                  <span>Revision {project.revision}</span>
                </div>
              </div>
              <div className="sun-bar">
                <div className="sun-label">
                  <span className="sun-symbol">☼</span>
                  <div>
                    <strong>Sun & shadow</strong>
                    <small>Flat site · Existing home: 25 ft</small>
                  </div>
                </div>
                <div className="select-wrap month-picker">
                  <select
                    aria-label="Study month"
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                  >
                    {[
                      "January",
                      "February",
                      "March",
                      "April",
                      "May",
                      "June",
                      "July",
                      "August",
                      "September",
                      "October",
                      "November",
                      "December",
                    ].map((name, index) => (
                      <option key={name} value={index + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} />
                </div>
                <div className="time-slider">
                  <div>
                    <strong>
                      {Math.floor(hour) % 12 || 12}:
                      {hour % 1 === 0 ? "00" : "30"} {hour >= 12 ? "pm" : "am"}
                    </strong>
                    <small>
                      15{" "}
                      {
                        [
                          "Jan",
                          "Feb",
                          "Mar",
                          "Apr",
                          "May",
                          "Jun",
                          "Jul",
                          "Aug",
                          "Sep",
                          "Oct",
                          "Nov",
                          "Dec",
                        ][month - 1]
                      }{" "}
                      2026
                    </small>
                  </div>
                  <input
                    type="range"
                    min={6}
                    max={20}
                    step={0.5}
                    value={hour}
                    aria-label="Time of day"
                    onChange={(e) => setHour(Number(e.target.value))}
                  />
                  <div className="range-labels">
                    <span>6am</span>
                    <span>Noon</span>
                    <span>8pm</span>
                  </div>
                </div>
              </div>
            </>
          ) : tab === "compare" ? (
            <CompareDesigns
              project={project}
              onApply={(patch) => {
                update(patch, "Compared design selected");
                setTab("design");
              }}
            />
          ) : tab === "evidence" ? (
            <Evidence project={project} checks={checks} />
          ) : (
            <div className="document-view activity-view">
              <div className="document-title">
                <Clock3 size={22} />
                <div>
                  <h1>A clear record of changes.</h1>
                  <p>
                    Actions in this session. Project dimensions are saved on
                    this device.
                  </p>
                </div>
              </div>
              <div className="project-file-actions">
                <button
                  className="button"
                  onClick={() => {
                    download(
                      "groundwork-project.json",
                      JSON.stringify(project, null, 2),
                      "application/json",
                    );
                    setNotice("Project file downloaded.");
                  }}
                >
                  <Download size={15} />
                  Save project file
                </button>
                <button
                  className="button"
                  onClick={() => importRef.current?.click()}
                >
                  <Upload size={15} />
                  Restore project file
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importProject(file);
                    event.target.value = "";
                  }}
                />
              </div>
              {activity.length === 0 ? (
                <div className="activity-empty">
                  <div className="activity-line" />
                  <h2>Your next idea starts here.</h2>
                  <p>
                    Change a dimension, move the ADU, or ask the assistant.
                    <br />
                    The resulting actions will appear here.
                  </p>
                </div>
              ) : (
                <ol className="activity-list">
                  {activity.map((item) => (
                    <li key={item.id}>
                      <time>{item.time}</time>
                      <div>
                        <h3>{item.title}</h3>
                        <p>{item.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </section>
        <Assistant
          project={project}
          messages={messages}
          proposal={proposal}
          busy={busy}
          mode={mode}
          connected={connected}
          onMode={(newMode) => {
            if (newMode === "meta" && !connected) setModal(true);
            else setMode(newMode);
          }}
          onSend={(message) => void send(message)}
          onApply={() => {
            if (proposal?.revision === projectRef.current.revision) {
              update(
                proposal.patch,
                messages.find((message) => message.id === proposal.messageId)
                  ?.mode === "meta"
                  ? "Meta proposal applied"
                  : "Local proposal applied",
              );
              setProposal(null);
              setNotice(
                "Design updated. All sample checks have been recalculated.",
              );
            }
          }}
          onDismiss={() => setProposal(null)}
        />
      </main>}
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {intakeOpen && (
        <PlanIntake
          project={project}
          apiKey={apiKey}
          connected={connected}
          onClose={() => setIntakeOpen(false)}
          onConnect={() => {
            setModal(true);
          }}
          onApply={(patch) => {
            update(patch, "Reviewed plan dimensions applied");
            setNotice(
              "ADU dimensions updated. All checks have been recalculated.",
            );
          }}
        />
      )}
      <dialog
        ref={modalRef}
        className="connection-modal"
        onCancel={() => {
          setModal(false);
          setDraftKey("");
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setModal(false);
            setDraftKey("");
          }
        }}
      >
        <button
          className="modal-close icon-button"
          aria-label="Close Meta connection"
          onClick={() => {
            setModal(false);
            setDraftKey("");
          }}
        >
          <X size={20} />
        </button>
        <div className="connection-mark">
          <Link size={24} />
        </div>
        <h2>
          {connected ? "Your Meta connection" : "Bring Meta into the workflow."}
        </h2>
        <p>
          Connect Muse Spark to interpret requests, call the planning tools, and
          propose changes to your design.
        </p>
        {connected ? (
          <>
            <div className="connected-state">
              <Check size={18} />
              <span>Muse Spark 1.3 connected</span>
            </div>
            <p className="connection-help">
              A key entered here stays in this tab’s memory. It is sent only to
              this app’s server and Meta’s API, and is cleared when you refresh
              or disconnect.
            </p>
            <button
              className="button disconnect-button"
              onClick={() => {
                setApiKey("");
                setVerified(false);
                setMode("local");
                setModal(false);
                setNotice(
                  serverConfigured
                    ? "Switched to local mode. Server credentials remain configured."
                    : "Meta disconnected. Local demonstration is available.",
                );
              }}
            >
              Use local mode
            </button>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void connect();
            }}
          >
            <label htmlFor="meta-key">Meta Model API key</label>
            <input
              id="meta-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draftKey}
              onChange={(event) => setDraftKey(event.target.value)}
              placeholder={
                serverConfigured
                  ? "Server key configured; leave blank to verify"
                  : "Enter your key securely"
              }
              required={!serverConfigured}
            />
            <p className="connection-help">
              Kept in this tab’s memory, never saved to the project or device
              storage. Requests pass through this app’s server to api.meta.ai.
              Activation and billing must be complete in your Meta account.
            </p>
            {connectError && (
              <div className="form-error" role="alert">
                {connectError}
              </div>
            )}
            <button
              className="button primary connect-submit"
              type="submit"
              disabled={connecting}
            >
              {connecting ? (
                <>
                  <LoaderCircle size={16} className="spin" />
                  Checking Meta access…
                </>
              ) : (
                <>
                  {serverConfigured && !draftKey
                    ? "Verify server connection"
                    : "Connect Muse Spark"}
                  <ArrowRight size={15} />
                </>
              )}
            </button>
            <a
              href="https://dev.meta.ai/docs/quickstart"
              target="_blank"
              rel="noreferrer"
              className="setup-link"
            >
              Open Meta’s account setup guide ↗
            </a>
          </form>
        )}
      </dialog>
    </div>
  );
}
