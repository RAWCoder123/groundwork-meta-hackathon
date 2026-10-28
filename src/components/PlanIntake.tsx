import { useEffect, useRef, useState } from "react";
import {
  ImagePlus,
  X,
  LoaderCircle,
  ArrowRight,
  Check,
  CircleAlert,
} from "lucide-react";
import type { DesignPatch, Project } from "../domain/types";
import { validateDesign } from "../domain/engine";
import type { PlanExtraction } from "../../server/intake";

type Props = {
  project: Project;
  apiKey: string;
  connected: boolean;
  onClose: () => void;
  onConnect: () => void;
  onApply: (patch: DesignPatch) => void;
};
export function PlanIntake({
  project,
  apiKey,
  connected,
  onClose,
  onConnect,
  onApply,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null);
  const [image, setImage] = useState<{
      name: string;
      mime: string;
      data: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<PlanExtraction | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [baseRevision, setBaseRevision] = useState(project.revision);
  useEffect(() => {
    dialog.current?.showModal();
    return () => controller.current?.abort();
  }, []);
  async function select(file: File) {
    setError("");
    setResult(null);
    setConfirmed(false);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Choose a PNG, JPEG or WebP plan image.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Choose an image no larger than 4 MB.");
      return;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setImage({ name: file.name, mime: file.type, data });
    } catch {
      setError("This image could not be opened.");
    }
  }
  async function read() {
    if (!image || !connected || busy) return;
    setBusy(true);
    setError("");
    setConfirmed(false);
    setResult(null);
    setBaseRevision(project.revision);
    controller.current = new AbortController();
    try {
      const response = await fetch("/api/intake", {
        method: "POST",
        signal: controller.current.signal,
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "x-meta-api-key": apiKey } : {}),
        },
        body: JSON.stringify({ file: image, project }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "The plan could not be read.");
      if (data.mode !== "meta" || !data.extracted)
        throw new Error("The service did not return a Meta extraction.");
      setResult(data.extracted);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError(
          e instanceof Error ? e.message : "The plan could not be read.",
        );
    } finally {
      setBusy(false);
    }
  }
  const patch: DesignPatch = {};
  if (result) {
    if (result.aduWidth !== null) patch.width = result.aduWidth;
    if (result.aduDepth !== null) patch.depth = result.aduDepth;
    if (result.aduHeight !== null) patch.height = result.aduHeight;
  }
  let validPatch = Object.keys(patch).length > 0;
  try {
    validateDesign({ ...project.design, ...patch });
  } catch {
    validPatch = false;
  }
  const mismatch =
    !!result &&
    ((result.siteWidth !== null &&
      Math.abs(result.siteWidth - project.site.width) > 0.1) ||
      (result.siteDepth !== null &&
        Math.abs(result.siteDepth - project.site.depth) > 0.1));
  const stale = result !== null && baseRevision !== project.revision;
  return (
    <dialog
      ref={dialog}
      className="connection-modal intake-modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        className="modal-close icon-button"
        aria-label="Close plan intake"
        onClick={onClose}
      >
        <X size={20} />
      </button>
      <div className="connection-mark">
        <ImagePlus size={24} />
      </div>
      <h2>Start with what’s on the drawing.</h2>
      <p>
        Meta reads explicit printed dimensions. You review them before anything
        changes.
      </p>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void select(file);
          e.target.value = "";
        }}
      />
      <button
        className="intake-upload"
        onClick={() => fileInput.current?.click()}
        disabled={busy}
      >
        <ImagePlus size={20} />
        <span>
          {image ? image.name : "Choose a plan image"}
          <small>PNG, JPEG or WebP · Up to 4 MB</small>
        </span>
      </button>
      <a className="setup-link" href="/sample-site-plan.png" download>
        Download the fictional example plan ↗
      </a>
      {image && (
        <img
          className="intake-preview"
          alt="Selected plan, stored only in this tab"
          src={`data:${image.mime};base64,${image.data}`}
        />
      )}
      {!result && (
        <>
          <p className="connection-help">
            This image will be sent through Schema to Meta when you choose Read
            with Meta. It is not saved to your project or browser storage. Use a
            drawing you have permission to share.
          </p>
          {connected ? (
            <button
              className="button primary connect-submit"
              onClick={() => void read()}
              disabled={!image || busy}
            >
              {busy ? (
                <>
                  <LoaderCircle size={15} className="spin" />
                  Reading printed dimensions…
                </>
              ) : (
                <>
                  Read with Meta
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          ) : (
            <button
              className="button primary connect-submit"
              onClick={onConnect}
            >
              Connect Meta first
              <ArrowRight size={15} />
            </button>
          )}
        </>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <div className="intake-results">
          <div className="intake-result-heading">
            <Check size={16} />
            <strong>Meta’s proposed transcription</strong>
          </div>
          <p>{result.summary}</p>
          <dl>
            {[
              ["Site width", result.siteWidth],
              ["Site depth", result.siteDepth],
              ["ADU width", result.aduWidth],
              ["ADU depth", result.aduDepth],
              ["ADU height", result.aduHeight],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt>{label}</dt>
                <dd>{value === null ? "Not identified" : `${value} ft`}</dd>
              </div>
            ))}
          </dl>
          {result.observations.length > 0 && (
            <details>
              <summary>Printed evidence</summary>
              <ul>
                {result.observations.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </details>
          )}
          {result.missingFacts.length > 0 && (
            <div className="intake-missing">
              <strong>Still unknown</strong>
              <ul>
                {result.missingFacts.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {mismatch && (
            <div className="form-error">
              <CircleAlert size={14} /> This drawing’s site dimensions differ
              from the selected fictional site. This version supports only the
              included sites; the result can be used as a reference, but cannot
              be applied.
            </div>
          )}
          {stale && (
            <div className="form-error">
              The design changed while this image was being read. Read it again
              before applying.
            </div>
          )}
          {!validPatch && (
            <p className="connection-help">
              No ADU dimensions within the supported scene limits were
              identified.
            </p>
          )}
          <label className="intake-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I checked these dimensions against the drawing.
          </label>
          <button
            className="button primary connect-submit"
            disabled={!confirmed || !validPatch || mismatch || stale}
            onClick={() => {
              onApply(patch);
              onClose();
            }}
          >
            <Check size={15} />
            Apply ADU dimensions
          </button>
          <button
            className="intake-read-again"
            onClick={() => {
              setResult(null);
              setConfirmed(false);
            }}
          >
            Choose or read another image
          </button>
          <p className="connection-help">
            Position is preserved. Unknown dimensions keep their current values.
            This does not confirm boundaries, survey accuracy or permit
            eligibility.
          </p>
        </div>
      )}
    </dialog>
  );
}
