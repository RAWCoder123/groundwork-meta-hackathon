import {validateCorrectionState,assessCorrections} from './corrections';
import type { Artifact, ArtifactKind, AutoProject, Decision, SourceRef, Stage, StageJob } from './types';
import { conceptChecks, validateOfficeConcept } from './concept';

const stages: Stage[] = ['understanding', 'design', 'preparation', 'handoff'];
const dependencies: Record<ArtifactKind, ArtifactKind[]> = {
  understanding: [], concept: ['understanding'], strategy: ['understanding'],
  preparation: ['understanding', 'concept', 'strategy'], handoff: ['understanding', 'concept', 'strategy', 'preparation'],
};
const stageFor: Record<ArtifactKind, Stage> = { understanding: 'understanding', concept: 'design', strategy: 'design', preparation: 'preparation', handoff: 'handoff' };
const labels: Record<Stage, string> = { understanding: 'Read the brief and project files', design: 'Develop the commercial concept and permit route', preparation: 'Coordinate evidence and prepare responses', handoff: 'Assemble the reviewed handoff' };
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const clone = <T>(value: T): T => structuredClone(value);
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) throw new Error(`${label} is missing or too long.`);
  return value;
}
function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} exceeds the supported limit.`);
  return value;
}
function positive(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 1_000_000) throw new Error(`${label} must be a positive revision.`);
  return Number(value);
}
function uniqueIds(values: unknown[], label: string) {
  const ids = values.map(value => text(object(value, label).id, `${label} ID`, 180));
  if (new Set(ids).size !== ids.length) throw new Error(`${label} IDs must be unique.`);
}
function versionMap(value: unknown): Record<string, number> {
  const map = object(value, 'Artifact versions');
  if (Object.keys(map).length > 30) throw new Error('Too many artifact versions.');
  for (const [key, version] of Object.entries(map)) { text(key, 'Artifact ID', 180); positive(version, 'Artifact revision'); }
  return map as Record<string, number>;
}
function source(value: unknown): SourceRef {
  const record = object(value, 'Source');
  const url = text(record.url, 'Source URL', 2048);
  try { if (new URL(url).protocol !== 'https:') throw new Error(); } catch { throw new Error('Sources require HTTPS URLs.'); }
  const accessedAt = text(record.accessedAt, 'Source access date', 80);
  if (!Number.isFinite(Date.parse(accessedAt))) throw new Error('Source access date is invalid.');
  return { url, title: text(record.title, 'Source title', 250), accessedAt, ...(record.claim===undefined?{}:{claim:text(record.claim,'Supported claim',2000)}), ...(record.contentSha256===undefined?{}:{contentSha256:text(record.contentSha256,'Content identity',100)}), ...(record.snapshotKey===undefined?{}:{snapshotKey:text(record.snapshotKey,'Source snapshot',1000)}), ...(record.retrievalKind==='retrieved_excerpt'||record.retrievalKind==='search_citation'?{retrievalKind:record.retrievalKind}:{}), ...(record.quote === undefined ? {} : { quote: text(record.quote, 'Source quote', 4000) }) };
}

/** Validate persisted project records, never trusting an imported object as authority. */
export function validateProject(value: unknown): AutoProject {
  const p = object(value, 'Project');
  const allowed = ['schemaVersion','id','ownerId','version','title','brief','stage','status','createdAt','updatedAt','documents','artifacts','decisions','tasks','messages','events','mail','questions','recipient','inboxStatus','blockedReason','pauseState','entryPoint','corrections'];
  if (Object.keys(p).some(key => !allowed.includes(key))) throw new Error('Project has unsupported fields.');
  if (p.schemaVersion !== 1) throw new Error('Unsupported project schema.');
  text(p.id, 'Project ID', 180); text(p.ownerId, 'Owner', 180); positive(p.version, 'Project version');
  text(p.title, 'Project title', 160); text(p.brief, 'Project brief', 12000);
  if (!stages.includes(p.stage as Stage)) throw new Error('Unsupported project stage.');
  if (!['running','needs_approval','needs_input','blocked','paused','awaiting_external'].includes(String(p.status))) throw new Error('Unsupported project status.');
  if (p.pauseState !== undefined) { const pause = object(p.pauseState,'Pause state'); positive(pause.fromVersion,'Paused run version'); positive(pause.targetVersion,'Pause target version'); if (Number(pause.fromVersion) >= Number(pause.targetVersion) || Number(pause.targetVersion) > Number(p.version) || !Number.isFinite(Date.parse(text(pause.pausedAt,'Pause date',80)))) throw new Error('Invalid pause state.'); }
  for (const key of ['createdAt', 'updatedAt']) if (!Number.isFinite(Date.parse(text(p[key], key, 80)))) throw new Error('Invalid project date.');
  validateCorrectionState(p as unknown as AutoProject);
  if(p.entryPoint!==undefined&&!['brief','corrections'].includes(String(p.entryPoint)))throw new Error('Unsupported project entry point.');
  const documents = array(p.documents, 'Documents', 8);
  const artifacts = array(p.artifacts, 'Artifacts', 30);
  const decisions = array(p.decisions, 'Decisions', 200);
  const tasks = array(p.tasks, 'Tasks', 100);
  const messages = array(p.messages, 'Messages', 300);
  const events = array(p.events, 'Events', 1000);
  const mail = array(p.mail, 'Mail actions', 100);
  array(p.questions, 'Questions', 30).forEach(q => text(q, 'Question', 2000));
  for (const [records, label] of [[documents,'Document'],[artifacts,'Artifact'],[decisions,'Decision'],[tasks,'Task'],[messages,'Message'],[events,'Event'],[mail,'Mail action']] as const) uniqueIds(records, label);
  for (const raw of documents) {
    const d = object(raw, 'Document'); text(d.name, 'Document name', 250); text(d.objectKey, 'Document object key', 1000); text(d.sha256,'Document hash',100);
    if(d.revision!==undefined)positive(d.revision,'Document revision');
    if(d.supersededBy!==undefined&&!documents.some(other=>object(other,'Document').id===d.supersededBy))throw new Error('Document replacement is not registered.');
    if (!['uploaded','processed','needs_review','failed'].includes(String(d.status))) throw new Error('Invalid document status.');
    if (!Number.isInteger(d.pages) || Number(d.pages) < 1 || Number(d.pages) > 50 || !Number.isInteger(d.bytes) || Number(d.bytes) < 1 || Number(d.bytes) > 10 * 1024 * 1024) throw new Error('Document exceeds the supported file or page limit.');
    array(d.excerpts,'Document excerpts',50).forEach(rawExcerpt => { const e = object(rawExcerpt,'Excerpt'); if (!Number.isInteger(e.page) || Number(e.page) < 1 || Number(e.page) > Number(d.pages)) throw new Error('Invalid excerpt page.'); text(e.text,'Excerpt text',30000,true); });
    array(d.warnings,'Document warnings',50).forEach(warning => text(warning,'Document warning',2000));
  }
  for (const raw of artifacts) {
    const a = object(raw,'Artifact'); if (!Object.hasOwn(dependencies,String(a.kind))) throw new Error('Invalid artifact kind.');
    if (a.id !== a.kind) throw new Error('Artifact IDs must match their kind.');
    positive(a.revision,'Artifact revision'); text(a.title,'Artifact title',250); object(a.data,'Artifact data'); versionMap(a.dependsOn);
    array(a.sources,'Sources',50).forEach(source);
    if (a.kind === 'concept') validateOfficeConcept(a.data);
  }
  for (const raw of decisions) {
    const d = object(raw,'Decision'); if (!['understanding','design','package','external'].includes(String(d.kind)) || !['pending','approved','rejected','stale'].includes(String(d.status))) throw new Error('Invalid decision.');
    text(d.title,'Decision title',250); text(d.summary,'Decision summary',8000,true); versionMap(d.artifactVersions);
    if (d.feedback !== undefined) text(d.feedback,'Decision feedback',8000,true);
  }
  for (const raw of tasks) { const t = object(raw,'Task'); if (!stages.includes(t.stage as Stage) || !['queued','working','done','blocked'].includes(String(t.status))) throw new Error('Invalid task state.'); text(t.title,'Task title',250); text(t.detail,'Task detail',4000,true); }
  for (const raw of messages) { const m = object(raw,'Message'); if (!['user','agent','system'].includes(String(m.role))) throw new Error('Invalid message role.'); text(m.text,'Message text',12000,true); }
  for (const raw of events) { const e = object(raw,'Event'); text(e.type,'Event type',100); text(e.detail,'Event detail',8000,true); }
  for (const raw of mail) {
    const m = object(raw,'Mail action'); positive(m.revision,'Mail revision'); text(m.to,'Recipient',500,true); text(m.subject,'Subject',500,true); text(m.body,'Email body',20000,true); versionMap(m.artifactVersions);
    array(m.attachmentIds,'Attachments',8).forEach(a => text(a,'Attachment ID',180)); text(m.decisionId,'Mail decision',180);
    if (!['draft','approved','sending','sent','uncertain','failed','stale'].includes(String(m.status))) throw new Error('Invalid mail status.');
  }
  if (p.recipient !== null) { const r = object(p.recipient,'Recipient'); text(r.name,'Recipient name',200,true); const email = text(r.email,'Recipient email',254); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid recipient address.'); }
  if (!['not_connected','waiting_for_refresh','connected'].includes(String(p.inboxStatus))) throw new Error('Invalid inbox status.');
  if (p.blockedReason !== undefined) text(p.blockedReason,'Blocked reason',4000,true);
  if (JSON.stringify(value).length > 900000) throw new Error('Project record is too large; shorten document excerpts.');
  return clone(value as AutoProject);
}

function event(p: AutoProject, type: string, detail: string) { p.events.push({ id: id('event'), type, detail, createdAt: now() }); }
function changed(p: AutoProject, type: string, detail: string): AutoProject {
  p.version++; p.updatedAt = now(); event(p,type,detail); return validateProject(p);
}
function artifactCurrent(p: AutoProject, a: Artifact, visiting = new Set<string>()): boolean {
  if (visiting.has(a.id)) return false;
  const seen = new Set(visiting); seen.add(a.id);
  return Object.entries(a.dependsOn).every(([artifactId, revision]) => {
    const dependency = p.artifacts.find(candidate => candidate.id === artifactId);
    return !!dependency && dependency.revision === revision && artifactCurrent(p,dependency,seen);
  });
}
function referencesCurrent(p: AutoProject, versions: Record<string,number>): boolean {
  return Object.keys(versions).length > 0 && Object.entries(versions).every(([artifactId,revision]) => {
    const artifact = p.artifacts.find(candidate => candidate.id === artifactId);
    return !!artifact && artifact.revision === revision && artifactCurrent(p,artifact);
  });
}

export function createAutoProject(ownerId: string, brief: string): AutoProject {
  const owner = text(ownerId,'Owner',180).trim(), description = text(brief,'Brief',12000).trim(), timestamp = now();
  const project: AutoProject = {
    schemaVersion:1,id:id('project'),ownerId:owner,version:1,title:description.split(/[\n.!?]/)[0].slice(0,100) || 'Commercial fit-out',brief:description,stage:'understanding',status:'running',createdAt:timestamp,updatedAt:timestamp,
    documents:[],artifacts:[],decisions:[],tasks:stages.map(stage => ({ id:`task_${stage}`,stage,title:labels[stage],status:stage === 'understanding' ? 'working' : 'queued',detail:'Awaiting agent work; no result has been generated.' })),
    messages:[{id:id('message'),role:'user',text:description,createdAt:timestamp}],events:[],mail:[],questions:[],recipient:null,inboxStatus:'not_connected',
  };
  event(project,'project_created','Project brief received. Agent work is queued; no design, permit status or external action is assumed.');
  return validateProject(project);
}
export function createStageJob(project: AutoProject): StageJob {
  const p = validateProject(project), timestamp = now();
  if (p.status !== 'running') throw new Error('Only an authorized running stage can be queued.');
  return { id:`${p.id}:${p.stage}:${p.version}`,projectId:p.id,stage:p.stage,status:'queued',projectVersion:p.version,modelRequests:0,toolExecutions:0,retries:0,startedAt:timestamp,updatedAt:timestamp,nextRunAt:timestamp,history:[],completedCallIds:[] };
}
export function currentDecision(project: AutoProject): Decision|null { const p = validateProject(project); return p.decisions.find(d => d.status === 'pending' && referencesCurrent(p,d.artifactVersions)) || null; }

export function putArtifact(project: AutoProject, kind: ArtifactKind, data: Record<string,unknown>, sources: SourceRef[] = []): AutoProject {
  const p = validateProject(project);
  if (!Object.hasOwn(dependencies,kind)) throw new Error('Unsupported artifact kind.');
  object(data,'Artifact data'); if (kind === 'concept') validateOfficeConcept(data);
  const refs = array(sources,'Sources',50).map(source);
  const dependsOn: Record<string,number> = {};
  for (const dependencyKind of (p.entryPoint==='corrections'&&['preparation','handoff'].includes(kind)?dependencies[kind].filter(k=>k!=='concept'&&k!=='strategy'):dependencies[kind])) {
    const dependency = p.artifacts.find(a => a.id === dependencyKind);
    if (!dependency || !artifactCurrent(p,dependency)) throw new Error(`Create current ${dependencyKind} work before ${kind}.`);
    dependsOn[dependency.id] = dependency.revision;
  }
  const old = p.artifacts.find(a => a.id === kind);
  const artifact: Artifact = { id:kind,kind,revision:(old?.revision || 0)+1,title:({understanding:'Project understanding',concept:'Commercial office concept',strategy:'Permit strategy',preparation:'Prepared responses and coordination',handoff:'Applicant handoff package'})[kind],data:clone(data),dependsOn,sources:refs,createdAt:now() };
  p.artifacts = [...p.artifacts.filter(a => a.id !== kind),artifact];
  const affected = new Set<string>([kind]);
  let expanded = true;
  while (expanded) { expanded = false; for (const a of p.artifacts) if (!affected.has(a.id) && Object.keys(a.dependsOn).some(key => affected.has(key))) { affected.add(a.id); expanded = true; } }
  for (const d of p.decisions) if ((d.status === 'approved' || d.status === 'pending') && Object.keys(d.artifactVersions).some(key => affected.has(key))) d.status = 'stale';
  for (const mail of p.mail) if (!['sent','uncertain','sending'].includes(mail.status) && Object.keys(mail.artifactVersions).some(key => affected.has(key))) mail.status = 'stale';
  if(kind==='concept'&&old){const before=validateOfficeConcept(old.data),after=validateOfficeConcept(data),changes:string[]=[];for(const key of ['width','depth','height'] as const)if(before[key]!==after[key])changes.push(`Suite ${key}: ${before[key]} → ${after[key]} ft`);for(const room of after.rooms){const prior=before.rooms.find(r=>r.id===room.id);if(!prior){changes.push(`${room.name} added`);continue;}for(const key of ['name','x','y','width','depth','kind'] as const)if(prior[key]!==room[key])changes.push(`${prior.name} ${key}: ${prior[key]} → ${room[key]}`);}for(const room of before.rooms)if(!after.rooms.some(r=>r.id===room.id))changes.push(`${room.name} removed`);if(JSON.stringify(before.doors)!==JSON.stringify(after.doors))changes.push('Door locations or openings changed');if(JSON.stringify(before.circulation)!==JSON.stringify(after.circulation))changes.push('Circulation geometry changed');event(p,'concept_change_summary',`Concept revision ${old.revision} → ${artifact.revision}. ${changes.join('; ').slice(0,3000)||'Notes or assumptions revised'}. Affected current work: ${[...affected].join(', ')}. Dependent approvals require renewed review.`);}
  const nextStage = stageFor[kind];
  if (stages.indexOf(nextStage) < stages.indexOf(p.stage)) p.stage = nextStage;
  p.status = p.questions.length ? 'needs_input' : 'running'; delete p.blockedReason;
  return changed(p,'artifact_updated',`${artifact.title} revision ${artifact.revision} saved. Dependent approvals require renewed review.`);
}

export function finishStage(project: AutoProject): AutoProject {
  const p = validateProject(project);
  if (p.status === 'paused' || p.status === 'blocked' || p.status === 'awaiting_external') throw new Error('This stage is not running.');
  if(p.entryPoint==='corrections'&&(!p.corrections||p.corrections.confirmedRevision!==p.corrections.revision)){p.status='needs_input';return changed(p,'register_review_required','Review and confirm the authoritative reviewer comment register before advancing.');}
  if (p.questions.length) { p.status = 'needs_input'; return changed(p,'input_required','Consolidated questions must be answered before this stage can finish.'); }
  const needed: ArtifactKind[] = p.stage === 'understanding' ? ['understanding'] : p.stage === 'design' ? ['concept','strategy'] : p.stage === 'preparation' ? ['preparation'] : ['handoff'];
  for (const kind of needed) { const a = p.artifacts.find(a => a.id === kind); if (!a || !artifactCurrent(p,a)) throw new Error(`Current ${kind} work is required before approval.`); }
  if (p.stage === 'design') {
    const concept = p.artifacts.find(a => a.id === 'concept')!;
    if (conceptChecks(validateOfficeConcept(concept.data)).some(check => !check.passed)) throw new Error('The concept has unresolved geometry checks.');
  }
  const task = p.tasks.find(task => task.stage === p.stage); if (task) { task.status='done'; task.detail='Agent work recorded; approval and external evidence remain separate.'; }
  if (p.stage === 'preparation' && !p.artifacts.some(a => a.id === 'handoff' && artifactCurrent(p,a))) {
    p.stage='handoff'; p.status='running'; const handoffTask = p.tasks.find(task => task.stage === 'handoff'); if (handoffTask) handoffTask.status='working';
    return changed(p,'stage_advanced','Preparation recorded. Assemble the current applicant handoff before package approval.');
  }
  if (p.stage === 'preparation') {
    p.stage = 'handoff';
    const handoffTask = p.tasks.find(task => task.stage === 'handoff');
    if (handoffTask) { handoffTask.status = 'done'; handoffTask.detail = 'Current handoff assembled; applicant package approval is pending.'; }
  }
  const kind: Decision['kind'] = p.stage === 'understanding' ? 'understanding' : p.stage === 'design' ? 'design' : 'package';
  const includedBase = p.stage === 'understanding' ? ['understanding'] : p.stage === 'design' ? ['understanding','concept','strategy'] : ['understanding','concept','strategy','preparation','handoff'];
  const included=p.entryPoint==='corrections'?includedBase.filter(k=>!['concept','strategy'].includes(k)||p.artifacts.some(a=>a.id===k)):includedBase;
  const artifactVersions = Object.fromEntries(included.map(artifactId => { const a = p.artifacts.find(a => a.id === artifactId); if (!a || !artifactCurrent(p,a)) throw new Error('A dependent artifact is missing or stale.'); return [a.id,a.revision]; }));
  const existing = p.decisions.find(d => d.status === 'pending' && d.kind === kind && JSON.stringify(d.artifactVersions) === JSON.stringify(artifactVersions));
  if (!existing) p.decisions.push({ id:id('decision'),kind,status:'pending',title:kind === 'understanding' ? 'Confirm the project understanding' : kind === 'design' ? 'Review the design and permit strategy' : 'Review the handoff package',summary:kind === 'package' ? 'Review the current package, unresolved responsibilities and handoff contents. Approval does not issue a permit, submit to the city, or establish code compliance.' : 'Review the current proposal and assumptions. Give feedback to request a revision.',artifactVersions,createdAt:now() });
  p.status='needs_approval';
  return changed(p,'approval_requested',`A ${kind} checkpoint is ready for review of these exact artifact revisions.`);
}

export function applyDecision(project: AutoProject, decisionId: string, choice: 'approve'|'reject', feedback = ''): AutoProject {
  const p = validateProject(project); text(feedback,'Feedback',8000,true);
  if (choice !== 'approve' && choice !== 'reject') throw new Error('Choose approve or reject.');
  const decision = p.decisions.find(d => d.id === decisionId);
  if (!decision || decision.status !== 'pending' || !referencesCurrent(p,decision.artifactVersions)) throw new Error('This approval is stale or already decided. Review the current proposal.');
  if (choice === 'approve' && p.questions.length) throw new Error('Answer the outstanding questions before approving.');
  decision.status = choice === 'approve' ? 'approved' : 'rejected'; decision.decidedAt=now(); if (feedback.trim()) decision.feedback=feedback.trim();
  if (feedback.trim()) p.messages.push({id:id('message'),role:'user',text:feedback.trim(),createdAt:now()});
  if (choice === 'reject') {
    p.stage = decision.kind === 'understanding' ? 'understanding' : decision.kind === 'design' ? 'design' : decision.kind === 'package' ? 'handoff' : p.stage;
    p.status='running'; p.questions=[];
    const task=p.tasks.find(task=>task.stage===p.stage); if (task) { task.status='working'; task.detail='Revising in response to checkpoint feedback.'; }
  } else if (decision.kind === 'understanding') { p.stage=p.entryPoint==='corrections'?'preparation':'design'; p.status='running'; }
  else if (decision.kind === 'design') { p.stage='preparation'; p.status='running'; }
  else if (decision.kind === 'package') { p.status='awaiting_external'; }
  // An external approval records the decision only. The authorized send endpoint
  // must bind exact recipients/content/revisions and obtain a provider receipt.
  if (choice === 'approve' && (decision.kind === 'understanding' || decision.kind === 'design')) { const task=p.tasks.find(task=>task.stage===p.stage); if(task)task.status='working'; }
  delete p.blockedReason;
  return changed(p,choice === 'approve' ? 'checkpoint_approved' : 'revision_requested',`${decision.title}: ${choice === 'approve' ? 'approved' : 'revision requested'}. External actions remain separately authorized.`);
}
export function applyFeedback(project: AutoProject, feedback: string): AutoProject {
  const p = validateProject(project), content = text(feedback,'Feedback',8000).trim();
  p.messages.push({id:id('message'),role:'user',text:content,createdAt:now()});
  const active = p.decisions.find(d => d.status === 'pending' && d.kind !== 'external');
  if (active) { active.status='rejected'; active.feedback=content; active.decidedAt=now(); p.stage=active.kind === 'understanding' ? 'understanding' : active.kind === 'design' ? 'design' : 'handoff'; }
  else if (p.status === 'awaiting_external') p.stage='handoff';
  p.questions=[]; p.status='running'; delete p.blockedReason;
  const task=p.tasks.find(task=>task.stage===p.stage); if(task) { task.status='working'; task.detail='Incorporate the latest project feedback.'; }
  return changed(p,'feedback_received','Project feedback received. Agent revision work is queued; no new approval or authority is inferred.');
}

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
function correctionPacket(p:AutoProject){const r=assessCorrections(p);if(!r.registered)return '<p>No authoritative review-comment register is recorded.</p>';return `<p><strong>${r.coverage} of ${r.total} comments accounted for.</strong> ${r.confirmed?'Register confirmed by the applicant.':'Register completeness is unconfirmed.'} This is a coordination handoff. City acceptance and submission readiness are not established.</p><ul>${r.issues.map(i=>`<li data-issue-code="${escape(i.code)}">${escape(i.detail)}</li>`).join('')}</ul><table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr>${['Reviewer item','Original wording','Response draft','Current review','Evidence and outstanding work'].map(t=>`<th style="text-align:left;border-bottom:1px solid #aaa;padding:8px">${t}</th>`).join('')}</tr></thead><tbody>${r.items.map(i=>`<tr>${[`${i.comment.discipline} ${i.comment.number}`,i.comment.wording,i.draft?.response??'No response drafted.',`${i.reviewed?'Applicant reviewed':'Applicant review required'}; ${i.supported?'passage support confirmed':'support unconfirmed'}; city acceptance not recorded`,`${i.draft?.evidence.map(e=>`${p.documents.find(d=>d.id===e.documentId)?.name??e.documentId}, revision ${e.revision}, page ${e.page}: “${e.quote}”`).join(' ')} Outstanding: ${i.unresolved.join('; ')||'See package responsibilities.'}`].map(value=>`<td style="vertical-align:top;padding:8px;border-bottom:1px solid #ddd">${escape(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
function conceptPacket(p:AutoProject){const a=p.artifacts.find(a=>a.kind==='concept');if(!a)return '';const c=validateOfficeConcept(a.data),approved=p.decisions.some(d=>d.status==='approved'&&d.artifactVersions.concept===a.revision);return `<h2>Current conceptual plan · revision ${a.revision}</h2><p>${approved?'Included in a current applicant approval.':'Not currently approved.'} Suite dimensions are declared inputs, not field measurements; room geometry is proposed. This is not a permit drawing.</p><svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Current conceptual floor plan" viewBox="-1 -1 ${c.width+2} ${c.depth+2}" style="max-height:420px;width:100%"><rect width="${c.width}" height="${c.depth}" fill="#f5f6ef" stroke="#44543c" stroke-width=".2"/>${c.circulation.map(r=>`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.depth}" fill="#e8e1c7"/>`).join('')}${c.rooms.map(r=>`<g><rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.depth}" fill="#dce3d3" stroke="#44543c" stroke-width=".15"/><text x="${r.x+r.width/2}" y="${r.y+r.depth/2}" text-anchor="middle" font-size="1.2">${escape(r.name)}</text></g>`).join('')}${c.doors.map(d=>{const horizontal=d.wall==='north'||d.wall==='south';return `<line x1="${horizontal?d.x-d.width/2:d.x}" y1="${horizontal?d.y:d.y-d.width/2}" x2="${horizontal?d.x+d.width/2:d.x}" y2="${horizontal?d.y:d.y+d.width/2}" stroke="white" stroke-width=".5"/>`;}).join('')}</svg><p>Existing-condition notes requiring verification: ${escape(c.existingNotes)}</p>`;}
export function buildAutonomousPacket(project: AutoProject): string {
  const p=validateProject(project);
  const sourceRecords = p.artifacts.flatMap(a=>a.sources);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(p.title)} · Schema handoff</title><style>body{font:15px/1.6 system-ui;color:#29332a;max-width:1000px;margin:40px auto;padding:0 24px}h1,h2,h3{line-height:1.25}section{padding:18px 0;border-top:1px solid #ddd;break-inside:avoid}.notice{border:2px solid #a58a58;padding:18px;background:#fbf7ef}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}a{color:#445d3a}.meta{color:#6e7869;font-size:12px}@media print{body{margin:0}}</style></head><body><p class="meta">SCHEMA · COMMERCIAL PROJECT COORDINATION · PROJECT REVISION ${p.version}</p><h1>${escape(p.title)}</h1><div class="notice"><strong>Applicant review handoff — not complete permit drawings or city approval</strong><p>This packet records the project brief, conceptual work, sources and outstanding responsibilities. It does not prove plan adequacy, professional sign-off, actual city submission, permit issuance, or construction completion. Supporting files and responsible professional review remain separate.</p></div><h2>Project brief</h2><pre>${escape(p.brief)}</pre><p>Current stage: ${escape(p.stage)} · Status: ${escape(p.status)}</p>${p.blockedReason ? `<p><strong>Attention required:</strong> ${escape(p.blockedReason)}</p>`:''}<h2>Questions and missing information</h2>${p.questions.length ? `<ul>${p.questions.map(q=>`<li>${escape(q)}</li>`).join('')}</ul>`:'<p>No unanswered project questions are recorded. This does not establish technical completeness.</p>'}<h2>Current artifacts and assumptions</h2>${p.artifacts.map(a=>`<section><h3>${escape(a.title)} · revision ${a.revision}</h3><p class="meta">${artifactCurrent(p,a)?'Current dependency references':'STALE — dependent work changed'}</p><pre>${escape(JSON.stringify(a.data,null,2))}</pre></section>`).join('')}<h2>Correction coverage and unresolved work</h2>${correctionPacket(p)}${conceptPacket(p)}<h2>Review checkpoints</h2>${p.decisions.map(d=>`<section><h3>${escape(d.title)} — ${escape(d.status)}</h3><p>${escape(d.summary)}</p><p class="meta">Artifact versions: ${escape(JSON.stringify(d.artifactVersions))}</p>${d.feedback?`<pre>${escape(d.feedback)}</pre>`:''}</section>`).join('')}<h2>Tasks</h2><ul>${p.tasks.map(t=>`<li><strong>${escape(t.title)}</strong> — ${escape(t.status)}. ${escape(t.detail)}</li>`).join('')}</ul><h2>Registered project files</h2><ul>${p.documents.map(d=>`<li>${escape(d.name)} · ${d.pages} pages · ${escape(d.status)}${d.warnings.length?` — ${escape(d.warnings.join('; '))}`:''}</li>`).join('')}</ul><h2>External coordination</h2>${p.mail.length?p.mail.map(m=>`<section><h3>${escape(m.subject||'Untitled message')} — ${escape(m.status)}</h3><p>To: ${escape(m.to||'Recipient not selected')}</p><pre>${escape(m.body)}</pre>${m.receipt?`<p class="meta">Provider receipt: ${escape(m.receipt.provider)} · ${escape(m.receipt.messageId)} · ${escape(m.receipt.sentAt)}</p>`:'<p>No provider delivery receipt recorded.</p>'}</section>`).join(''):'<p>No external messages or submission receipts are recorded.</p>'}<h2>Source record</h2>${sourceRecords.length?sourceRecords.map(s=>`<section><h3><a href="${escape(s.url)}">${escape(s.title)}</a></h3><p class="meta">Accessed ${escape(s.accessedAt)}</p>${s.quote?`<pre>${escape(s.quote)}</pre>`:''}</section>`).join(''):'<p>No researched sources have been recorded.</p>'}<h2>Path to the physical project</h2><p>Obtain the responsible professionals’ drawings and sign-off, authorized city submission, verified review/issuance records, and applicable inspections before treating the project as permitted or built. Schema records evidence; it does not create municipal authority.</p></body></html>`;
}
