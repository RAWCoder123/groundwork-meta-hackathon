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
