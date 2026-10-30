import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDecision, applyFeedback, buildAutonomousPacket, createAutoProject, createStageJob, currentDecision, finishStage, putArtifact, validateProject } from '../src/autonomy/domain';
import { makeOfficeConcept } from '../src/autonomy/concept';
import type { AutoProject } from '../src/autonomy/types';
const create = () => createAutoProject('owner-test','A fictional 60 by 40 foot Portland office fit-out.');
function understood() {
  let p=putArtifact(create(),'understanding',{summary:'Fictional office brief',assumptions:['Dimensions are fictional'],missingInformation:['Professional plans are not supplied']});
  p=finishStage(p); return applyDecision(p,currentDecision(p)!.id,'approve');
}
function designed() {
  let p=putArtifact(understood(),'concept',makeOfficeConcept() as unknown as Record<string,unknown>);
  p=putArtifact(p,'strategy',{summary:'Prepare standard office TI documentation',unresolved:['Confirm existing legal occupancy']});
  p=finishStage(p); return applyDecision(p,currentDecision(p)!.id,'approve');
}
function packaged() {
  let p=putArtifact(designed(),'preparation',{summary:'Draft only',missingInformation:['Actual professional drawings']});
  p=putArtifact(p,'handoff',{summary:'Coordination handoff',unresolved:['Professional sign-off','Actual city filing']});
  return finishStage(p);
}

test('new project records a brief and queue without pretending agent work or permitting occurred',()=>{
  const p=create(); assert.equal(p.stage,'understanding');assert.equal(p.status,'running');assert.equal(p.artifacts.length,0);assert.equal(p.decisions.length,0);assert.equal(p.tasks[0].status,'working');assert.equal(p.events.length,1);assert.equal(p.messages[0].role,'user');
  assert.throws(()=>createAutoProject('','brief'));assert.throws(()=>createAutoProject('owner',''));
});
test('job identity is stable per authorized project revision, preventing duplicate enqueue identities',()=>{
  const p=create();assert.equal(createStageJob(p).id,createStageJob(p).id);assert.equal(createStageJob(p).projectVersion,p.version);
  assert.throws(()=>createStageJob({...p,status:'needs_approval'}));
});
test('approval advances stages only after current artifacts and geometric checks exist',()=>{
  assert.throws(()=>finishStage(create()),/understanding/);
  let p=understood();assert.equal(p.stage,'design');assert.equal(p.status,'running');assert.equal(p.decisions[0].status,'approved');
  assert.throws(()=>finishStage(p),/concept/);
  p=designed();assert.equal(p.stage,'preparation');assert.equal(p.status,'running');
  p=packaged();assert.equal(currentDecision(p)?.kind,'package');assert.equal(p.status,'needs_approval');
  p=applyDecision(p,currentDecision(p)!.id,'approve');assert.equal(p.status,'awaiting_external');
  assert.ok(!['issued','built','complete'].includes(p.status));assert.equal(p.mail.length,0);
});
test('questions remain blockers rather than being resolved by an artifact or stage completion',()=>{
  let p=putArtifact(create(),'understanding',{summary:'Brief read'});p.questions=['Who confirms the existing suite boundary?'];p=finishStage(p);
  assert.equal(p.status,'needs_input');assert.equal(p.questions.length,1);assert.equal(currentDecision(p),null);
});
test('downstream artifacts require current upstream evidence',()=>{
  assert.throws(()=>putArtifact(create(),'strategy',{summary:'No baseline'}),/understanding/);
  let p=designed();p=putArtifact(p,'understanding',{summary:'Boundary revised'});
  assert.throws(()=>putArtifact(p,'preparation',{summary:'Cannot use the old concept'}),/current concept/);
});
test('changing concept invalidates dependent design/package approvals but preserves understanding approval',()=>{
  let p=packaged();const packageId=currentDecision(p)!.id;p=applyDecision(p,packageId,'approve');
  const understanding=p.decisions.find(d=>d.kind==='understanding')!.id;
  const before=structuredClone(p);
  p=putArtifact(p,'concept',makeOfficeConcept(70,40) as unknown as Record<string,unknown>);
  assert.equal(p.decisions.find(d=>d.id===understanding)?.status,'approved');
  assert.equal(p.decisions.find(d=>d.kind==='design')?.status,'stale');assert.equal(p.decisions.find(d=>d.id===packageId)?.status,'stale');assert.equal(p.stage,'design');assert.equal(p.status,'running');
  assert.deepEqual(before.artifacts.find(a=>a.id==='concept')!.data,makeOfficeConcept());
  assert.throws(()=>applyDecision(p,packageId,'approve'),/stale/);
});
test('changing handoff keeps design approval while reopening only package-dependent work',()=>{
  let p=packaged();p=applyDecision(p,currentDecision(p)!.id,'approve');
  p=putArtifact(p,'handoff',{summary:'New response register',unresolved:['Professional drawings']});
  assert.equal(p.decisions.find(d=>d.kind==='design')?.status,'approved');assert.equal(p.decisions.find(d=>d.kind==='understanding')?.status,'approved');assert.equal(p.decisions.find(d=>d.kind==='package')?.status,'stale');
});
test('rejection queues a revision and does not grant authority or send a message',()=>{
  let p=putArtifact(create(),'understanding',{summary:'Initial assumptions'});p=finishStage(p);const d=currentDecision(p)!;
  p=applyDecision(p,d.id,'reject','Keep the existing circulation.');assert.equal(p.stage,'understanding');assert.equal(p.status,'running');assert.equal(p.decisions[0].feedback,'Keep the existing circulation.');assert.equal(p.messages.at(-1)?.text,'Keep the existing circulation.');assert.equal(p.mail.length,0);assert.equal(currentDecision(p),null);
  assert.throws(()=>applyDecision(p,d.id,'approve'),/already decided/);
});
test('feedback answers consolidated questions and queues agent reassessment, without fabricating approval',()=>{
  const p=create();p.questions=['What is the suite size?'];p.status='needs_input';
  const next=applyFeedback(p,'The supplied survey labels 60 by 40 feet.');assert.equal(next.status,'running');assert.equal(next.questions.length,0);assert.equal(next.artifacts.length,0);assert.equal(next.decisions.length,0);assert.equal(p.questions.length,1);
});
test('preparation can advance into handoff generation without a premature package approval',()=>{
  const p=finishStage(putArtifact(designed(),'preparation',{summary:'Ready to assemble'}));assert.equal(p.stage,'handoff');assert.equal(p.status,'running');assert.equal(p.decisions.filter(d=>d.kind==='package').length,0);
});
test('stale mail drafts are invalidated but historical delivery receipts are preserved',()=>{
  let p=packaged();const versions=Object.fromEntries(p.artifacts.map(a=>[a.id,a.revision]));
  p.mail=[{id:'mail-draft',revision:1,to:'architect@example.com',subject:'Request',body:'Draft',artifactVersions:versions,attachmentIds:[],status:'approved',decisionId:'external-draft'}, {id:'mail-sent',revision:1,to:'architect@example.com',subject:'Prior request',body:'Previously sent',artifactVersions:versions,attachmentIds:[],status:'sent',decisionId:'external-sent',receipt:{provider:'gmail',messageId:'receipt-1',sentAt:new Date().toISOString()}}];
  p=putArtifact(p,'handoff',{summary:'A revised package'});assert.equal(p.mail[0].status,'stale');assert.equal(p.mail[1].status,'sent');assert.equal(p.mail[1].receipt?.messageId,'receipt-1');
});
test('malformed persisted records, duplicate IDs and unsafe geometry are rejected',()=>{
  assert.throws(()=>validateProject({...create(),status:'issued'}));assert.throws(()=>validateProject({...create(),admin:true}));assert.throws(()=>validateProject({...create(),version:NaN}));
  const p=create();p.tasks.push({...p.tasks[0]});assert.throws(()=>validateProject(p),/unique/);
  const unsafe=makeOfficeConcept();unsafe.rooms[0].width=10000;assert.throws(()=>putArtifact(understood(),'concept',unsafe as unknown as Record<string,unknown>));
  assert.throws(()=>putArtifact(create(),'understanding',{},[{url:'javascript:alert(1)',title:'Unsafe',accessedAt:'2026-10-29'}]));
});
test('packet escapes project/model content and preserves unknown work, versions and handoff limits',()=>{
  let p=create();p.title='<img src=x onerror=alert(1)>';p=putArtifact(p,'understanding',{summary:'<script>alert(1)</script>',assumptions:['No actual survey'],missingInformation:['Professional drawings']});
  const html=buildAutonomousPacket(p);assert.ok(!html.includes('<script>alert'));assert.ok(!html.includes('<img src=x'));assert.match(html,/&lt;script&gt;/);assert.match(html,/Professional drawings/);assert.match(html,/not complete permit drawings or city approval/);assert.match(html,/No external messages or submission receipts/);assert.match(html,/revision 1/);
});

test('persisted critiques are validated and older projects without them remain valid',()=>{
 const p=createAutoProject('owner','Fictional office brief for critique validation.');
 assert.doesNotThrow(()=>validateProject(p));
 const good={...p,critiques:[{id:'c1',stage:'understanding',jobId:'job',status:'clear',artifactVersions:{understanding:1},findings:[{severity:'advisory',artifactKind:'understanding',claim:'A claim.',issue:'An issue.'}],createdAt:new Date().toISOString()}]};
 assert.equal(validateProject(good).critiques?.length,1);
 assert.throws(()=>validateProject({...good,critiques:[{...good.critiques[0],findings:[{...good.critiques[0].findings[0],severity:'fatal'}]}]}),/critique finding/);
 assert.throws(()=>validateProject({...good,critiques:[{...good.critiques[0],status:'approved'}]}),/critique state/);
});
