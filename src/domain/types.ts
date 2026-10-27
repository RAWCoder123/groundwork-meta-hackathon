export type Outcome = "pass" | "fail" | "review";
export type Design = {
  width: number;
  depth: number;
  height: number;
  x: number;
  z: number;
  roof: "gable" | "flat";
};
export type Rect = { x: number; z: number; width: number; depth: number };
export type Site = {
  id: string;
  name: string;
  description: string;
  width: number;
  depth: number;
  house: Rect;
  latitude: number;
  longitude: number;
  north: number;
  dimensionsConfirmed: boolean;
  overlaysReviewed: boolean;
  primaryFloorArea: number;
};
export type Rule = {
  id: string;
  title: string;
  value: number;
  unit: string;
  source: string;
  section: string;
  note: string;
  kind: "demonstration" | "verified";
};
export type Check = {
  id: string;
  title: string;
  outcome: Outcome;
  measured: number | null;
  limit: number | null;
  unit: string;
  detail: string;
  ruleId: string | null;
};
export type Project = {
  name: string;
  site: Site;
  design: Design;
  revision: number;
};
export type DesignPatch = Partial<Design>;
export type AgentResult = {
  mode: "local" | "meta";
  message: string;
  patch: DesignPatch | null;
  steps: { tool: string; detail: string }[];
  model?: string;
  usage?: unknown;
};
