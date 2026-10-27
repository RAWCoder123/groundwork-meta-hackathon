import { applyPatch, checkProject, proposeRepair } from "./engine";
import type { AgentResult, DesignPatch, Project } from "./types";

const format = (value: number) => Number(value.toFixed(2));

/** Deliberately limited, deterministic demo commands. This function never calls Meta. */
export function runLocalAgent(project: Project, message: string): AgentResult {
  const text = message.trim().toLowerCase().slice(0, 1200);
  const before = checkProject(project);
  const steps = [
    {
      tool: "check_design",
      detail: `Evaluated revision ${project.revision}: ${before.filter((check) => check.outcome === "fail").length} sample checks fail; ${before.filter((check) => check.outcome === "review").length} require review.`,
    },
  ];
  const base = (message: string, patch: DesignPatch | null): AgentResult => ({
    mode: "local",
    message,
    patch,
    steps,
  });
  if (!text)
    return base(
      "Enter a design change, such as “move 5 ft west”, “increase width by 4 ft”, or “repair the design”. This local demonstration uses fixed commands, not a model.",
      null,
    );

  if (/\b(repair|fix|resolve|fit|correct)\b/.test(text)) {
    const patch = proposeRepair(project);
    steps.push({
      tool: "search_sample_layout",
      detail: patch
        ? "Searched bounded layout alternatives and rechecked the proposed change."
        : "No repair was returned by the bounded layout search.",
    });
    if (!patch)
      return base(
        before.some((check) => check.outcome === "fail")
          ? "I could not find a layout that passes the sample geometric checks. Reduce the requested footprint or ask a designer to review the site."
          : "The current geometry already passes the implemented sample checks. Property-specific requirements still need review.",
        null,
      );
    const after = checkProject(applyPatch(project, patch));
    steps.push({
      tool: "verify_proposed_patch",
      detail: `${after.filter((check) => check.outcome === "fail").length} sample checks fail after the proposed change. Review flags are unchanged.`,
    });
    return base(
      "I found a revised layout that passes the implemented sample geometry checks. Review the proposed changes before applying them. This does not establish permit eligibility or legal compliance.",
      patch,
    );
  }

  const patch: DesignPatch = {};
  const number = "(\\d+(?:\\.\\d+)?)";
  const direction =
    text.match(
      new RegExp(
        `(?:move|shift|slide)\\b.*?${number}\\s*(?:ft|feet|foot)?\\s*(west|east|north|south|left|right|back|forward)`,
      ),
    ) ??
    text.match(
      new RegExp(
        `(?:move|shift|slide)\\s+(west|east|north|south|left|right|back|forward)\\s+(?:by\\s+)?${number}`,
      ),
    );
  if (direction) {
    const amount = Number(
      direction[1].match(/^\d/) ? direction[1] : direction[2],
    );
    const heading = direction[1].match(/^\d/) ? direction[2] : direction[1];
    if (["west", "left"].includes(heading))
      patch.x = format(project.design.x - amount);
    if (["east", "right"].includes(heading))
      patch.x = format(project.design.x + amount);
    if (["north", "back"].includes(heading))
      patch.z = format(project.design.z + amount);
    if (["south", "forward"].includes(heading))
      patch.z = format(project.design.z - amount);
  }
  const setDimension = text.match(
    new RegExp(
      `(?:set|make|change)\\s+(?:the\\s+)?(width|depth|height)\\s+(?:to\\s+)?${number}`,
    ),
  );
  if (setDimension)
    patch[setDimension[1] as "width" | "depth" | "height"] = Number(
      setDimension[2],
    );
  const alterDimension = text.match(
    new RegExp(
      `(increase|decrease|reduce)\\s+(?:the\\s+)?(width|depth|height)\\s+(?:by\\s+)?${number}`,
    ),
  );
  if (alterDimension) {
    const dimension = alterDimension[2] as "width" | "depth" | "height";
    patch[dimension] = format(
      project.design[dimension] +
        Number(alterDimension[3]) * (alterDimension[1] === "increase" ? 1 : -1),
    );
  }
  if (/\b(wider|larger|bigger)\b/.test(text) && !patch.width && !patch.depth)
    patch.width = project.design.width + 4;
  if (/\b(smaller|narrower)\b/.test(text) && !patch.width && !patch.depth)
    patch.width = project.design.width - 4;
  if (/\bflat\s+roof\b/.test(text)) patch.roof = "flat";
  if (/\bgable(?:d)?\s+roof\b/.test(text)) patch.roof = "gable";
  if (Object.keys(patch).length === 0)
    return base(
      "The local demonstration supports “repair the design”, “move 5 ft west”, “set width to 28”, “increase depth by 4 ft”, and flat or gable roofs. Connect Meta for natural-language planning assistance.",
      null,
    );
  try {
    const proposed = applyPatch(project, patch);
    const after = checkProject(proposed);
    const failures = after.filter((check) => check.outcome === "fail");
    steps.push({
      tool: "validate_design_patch",
      detail: `Validated bounded fields: ${Object.keys(patch).join(", ")}.`,
    });
    steps.push({
      tool: "check_proposed_design",
      detail: failures.length
        ? `Proposed geometry fails: ${failures.map((check) => check.title).join(", ")}.`
        : "Proposed geometry passes the implemented sample checks; unresolved requirements remain.",
    });
    return base(
      failures.length
        ? `This change would fail ${failures.length} sample check${failures.length === 1 ? "" : "s"}: ${failures.map((check) => check.title.toLowerCase()).join(", ")}. You can inspect the proposal, or request a repair.`
        : "The requested change passes the implemented sample geometry checks. Review it before applying; property-specific requirements remain unresolved.",
      patch,
    );
  } catch (error) {
    return base(
      `The requested change is outside the supported scene limits. ${error instanceof Error ? error.message : "Use smaller dimensions or movement."}`,
      null,
    );
  }
}
