import test from "node:test";
import assert from "node:assert/strict";
import { agentPresentation } from "../src/autonomy/presentation";
import { createAutoProject } from "../src/autonomy/domain";
import type { IntegrationStatus } from "../src/autonomy/types";

const connections: IntegrationStatus = {metaConfigured:true,storageReady:true,gmail:{eligible:false,connected:false,reason:"Unavailable"},background:{configured:true,verified:false,lastTickAt:null},limits:{modelRequests:12,toolExecutions:24,minutes:60}};

test("agent activity does not animate unavailable model work or mistake a heartbeat for inference", () => {
  const p = createAutoProject("owner", "Fictional office");
  const missingKey = agentPresentation(p, {...connections,metaConfigured:false,background:{configured:true,verified:true,lastTickAt:new Date().toISOString()}});
  assert.equal(missingKey.active,false);
  assert.match(missingKey.detail,/server Meta key/);
  assert.equal(agentPresentation(p,{...connections,storageReady:false}).active,false);
});

test("paused, blocked, questions and external outcomes never present as active agent work", () => {
  const p = createAutoProject("owner", "Fictional office");
  for (const status of ["paused","blocked","needs_input","awaiting_external"] as const) {
    assert.equal(agentPresentation({...p,status},connections).active,false);
  }
  assert.match(agentPresentation({...p,status:"awaiting_external"},connections).detail,/require external evidence/);
});

test("an approval gate remains a review gate even with a missing model key", () => {
  const p = createAutoProject("owner", "Fictional office");
  const state = agentPresentation({...p,status:"needs_approval"},{...connections,metaConfigured:false});
  assert.equal(state.tone,"review");
  assert.equal(state.active,false);
});

test("working activity describes a persisted stage task without inventing completed steps", () => {
  const p = createAutoProject("owner", "Fictional office");
  p.tasks[0].status = "working";
  const state = agentPresentation(p,connections);
  assert.equal(state.active,true);
  assert.equal(state.detail,p.tasks[0].title);
  assert.equal(p.events.length,1);
});

test("known runner blockers read as plain next steps without hiding unknown reasons", () => {
  const p = createAutoProject("owner", "Fictional office");
  const missing = agentPresentation({...p,status:"blocked",blockedReason:"A server Meta connection is required for unattended work. Configure MODEL_API_KEY securely. No simulated result was substituted."},connections);
  assert.equal(missing.title,"Connect Meta to continue");
  assert.match(missing.detail,/retry saved work/);
  assert.equal(agentPresentation({...p,status:"blocked",blockedReason:"This stage reached its approved time or execution limit."},connections).title,"This run reached its limit");
  const unknown = agentPresentation({...p,status:"blocked",blockedReason:"Something specific went wrong."},connections);
  assert.equal(unknown.title,"Attention needed");
  assert.equal(unknown.detail,"Something specific went wrong.");
});

test("a checkpoint names the independent review outcome for its stage only", () => {
  const p = createAutoProject("owner", "Fictional office");
  const critique = {id:"c",stage:"understanding" as const,jobId:"j",status:"revised" as const,artifactVersions:{understanding:1},revisedVersions:{understanding:2},findings:[],createdAt:new Date().toISOString()};
  assert.match(agentPresentation({...p,status:"needs_approval",critiques:[critique]},connections).detail,/Independent review: Schema revised its drafts/);
  assert.doesNotMatch(agentPresentation({...p,stage:"design",status:"needs_approval",critiques:[critique]},connections).detail,/Independent review/);
});
