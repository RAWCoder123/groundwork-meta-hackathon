import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {advanceJob,pumpJobs} from '../server/autonomy/runner';
import {createAutoProject,createStageJob,applyFeedback,putArtifact,applyDecision,currentDecision,finishStage,buildAutonomousPacket} from '../src/autonomy/domain';
import {DatabaseSync} from 'node:sqlite';
import {createRepository,type D1Database,type D1Statement} from '../server/autonomy/repository';
import {makeOfficeConcept} from '../src/autonomy/concept';
import type {AutoProject,Preference,Repository,StageJob,ToolReceipt} from '../src/autonomy/types';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const copy=<T>(v:T):T=>structuredClone(v);
class MemoryRepository implements Repository {
 projects=new Map<string,AutoProject>(); jobs=new Map<string,StageJob>(); prefs=new Map<string,Preference>(); receipts=new Map<string,ToolReceipt>();
 async createProject(p:AutoProject){this.projects.set(p.id,copy(p));}
 async getProject(id:string){return copy(this.projects.get(id)||null);}
 async listProjects(ownerId:string){return [...this.projects.values()].filter(p=>p.ownerId===ownerId).map(copy);}
 async saveProject(p:AutoProject,expected:number){if(this.projects.get(p.id)?.version!==expected)return false;this.projects.set(p.id,copy(p));return true;}
 async getJob(id:string){return copy(this.jobs.get(id)||null);}
 async saveJob(j:StageJob,token?:string){const previous=this.jobs.get(j.id);if(token&&previous?.leaseToken!==token)return false;if(!token&&previous?.leaseUntil&&previous.leaseUntil>Date.now())return false;const next=copy(j);delete next.leaseToken;delete next.leaseUntil;this.jobs.set(j.id,next);return true;}
 async checkpointJob(j:StageJob,token:string){const previous=this.jobs.get(j.id);if(previous?.leaseToken!==token||(previous?.leaseUntil||0)<=Date.now())return false;this.jobs.set(j.id,copy(j));return true;}
 async claimJob(id:string,token:string,now:number,ms:number){const j=this.jobs.get(id);if(!j||['done','blocked','cancelled'].includes(j.status)||Date.parse(j.nextRunAt)>now||(j.leaseUntil||0)>now)return null;j.leaseToken=token;j.leaseUntil=now+ms;return copy(j);}
 async runnableJobs(limit:number){return [...this.jobs.values()].filter(j=>['queued','running','waiting_provider'].includes(j.status)&&Date.parse(j.nextRunAt)<=Date.now()&&(j.leaseUntil||0)<=Date.now()).slice(0,limit).map(copy);}
 async getPreferences(ownerId:string){return [...this.prefs.values()].filter(p=>p.ownerId===ownerId).map(copy);}
 async putPreference(p:Preference){this.prefs.set(p.id,copy(p));}
 async deletePreference(owner:string,id:string){if(this.prefs.get(id)?.ownerId===owner)this.prefs.delete(id);}
 async getReceipt(key:string){return copy(this.receipts.get(key)||null);}
 async recordReceiptIfAbsent(r:ToolReceipt){if(this.receipts.has(r.key))return false;this.receipts.set(r.key,copy(r));return true;}
 due(id:string){const j=this.jobs.get(id)!;j.nextRunAt=new Date(Date.now()-100).toISOString();}
}
const KEY='runner-test-secret-never-display';
// Legacy flows count exact provider requests; the critic phase has its own tests.
const env={MODEL_API_KEY:KEY,SCHEMA_CRITIC:'off'};
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const call=(name:string,args:unknown={},callId=name)=>({type:'function_call',call_id:callId,name,arguments:JSON.stringify(args)});
const done=(output:unknown[],id='resp_test')=>({id,status:'completed',output});
const final=(text='Prepared for your review.')=>({type:'message',content:[{type:'output_text',text}]});
const understanding={summary:'A fictional office fit-out concept.',confirmedFacts:['The brief declares a60by40foot office suite.'],assumptions:['Concept only; existing conditions and professional review remain unverified.'],missingInformation:['Actual approved permit history remains to be checked.']};
async function setup(){const repo=new MemoryRepository();const project=createAutoProject('owner','Fictional Portland office fit-out in a60by40foot suite.');await repo.createProject(project);const job=createStageJob(project);await repo.saveJob(job);return {repo,project,job};}

test('missing server key blocks unattended work honestly without provider access',async()=>{
 const {repo,project,job}=await setup();globalThis.fetch=async()=>{assert.fail('No provider access without key');};
 assert.equal((await advanceJob(repo,{},job.id)).status,'blocked');const saved=(await repo.getProject(project.id))!;assert.equal(saved.status,'blocked');assert.match(saved.blockedReason!,/server Meta connection/);assert.equal(saved.artifacts.length,0);
});

test('background response ID survives separate advances and stops at the real understanding approval',async()=>{
 const {repo,project,job}=await setup();let post=0;
 globalThis.fetch=async(url,init)=>{assert.equal(init?.redirect,'manual');assert.equal(new Headers(init?.headers).get('authorization'),`Bearer ${KEY}`);
 if(init?.method==='POST'){post++;const body=JSON.parse(String(init.body));assert.equal(body.background,true);assert.equal(body.store,true);assert.equal(body.model,'muse-spark-1.3');if(post===1)return response({id:'resp_wait',status:'queued'});assert.ok(body.input.some((i:any)=>i.type==='function_call_output'));return response(done([final()],'resp_final'));}
 assert.equal(url,'https://api.meta.ai/v1/responses/resp_wait');return response(done([call('inspect_project'),call('propose_understanding',understanding)],'resp_wait'));
 };
 assert.equal((await advanceJob(repo,env,job.id)).status,'waiting_provider');assert.equal((await repo.getJob(job.id))?.responseId,'resp_wait');
 repo.due(job.id);assert.equal((await advanceJob(repo,env,job.id)).status,'advanced');const draft=(await repo.getProject(project.id))!;assert.equal(draft.artifacts[0].kind,'understanding');assert.equal(draft.decisions.length,0);
 assert.equal((await advanceJob(repo,env,job.id)).status,'needs_approval');const ready=(await repo.getProject(project.id))!;assert.equal(currentDecision(ready)?.kind,'understanding');assert.equal(ready.decisions[0].status,'pending');assert.equal((await advanceJob(repo,env,job.id)).status,'not_claimed');assert.equal(post,2);
});

test('prose cannot skip tools or create a fake completed stage',async()=>{
 const {repo,project,job}=await setup();globalThis.fetch=async()=>response(done([final('Everything is approved and built.')]));
 await advanceJob(repo,env,job.id);const saved=(await repo.getProject(project.id))!;assert.equal(saved.artifacts.length,0);assert.equal(saved.status,'running');assert.equal(saved.decisions.length,0);assert.equal((await repo.getJob(job.id))?.modelRequests,1);
});

test('a newer user revision cancels the old job before another provider call',async()=>{
 const {repo,project,job}=await setup();await repo.saveProject(applyFeedback(project,'Please preserve the existing partitions.'),project.version);globalThis.fetch=async()=>{assert.fail('Stale job must not contact Meta');};assert.equal((await advanceJob(repo,env,job.id)).status,'cancelled');assert.match((await repo.getProject(project.id))!.messages.at(-1)!.text,/preserve/);
});

test('the lease prevents concurrent runner delivery from duplicating the model request',async()=>{
 const {repo,job}=await setup();let calls=0;let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});globalThis.fetch=async()=>{calls++;await gate;return response({id:'resp_wait',status:'queued'});};
 const first=advanceJob(repo,env,job.id);await new Promise(r=>setTimeout(r,5));assert.equal((await advanceJob(repo,env,job.id)).status,'not_claimed');release();await first;assert.equal(calls,1);
});

test('provider redirects and authentication failures stay safe without a local fallback',async()=>{
 for(const status of [302,401,403]){const {repo,project,job}=await setup();globalThis.fetch=async()=>new Response(KEY,{status,headers:{location:'https://elsewhere.invalid'}});const result=await advanceJob(repo,env,job.id);assert.equal(result.status,'blocked');assert.ok(!JSON.stringify(result).includes(KEY));assert.equal((await repo.getProject(project.id))?.artifacts.length,0);}
});

test('transient failures consume at most two scheduled retries and preserve bounded model counts',async()=>{
 const {repo,job}=await setup();globalThis.fetch=async()=>response({error:KEY},503);for(let i=0;i<2;i++){assert.equal((await advanceJob(repo,env,job.id)).status,'retry_scheduled');repo.due(job.id);}assert.equal((await advanceJob(repo,env,job.id)).status,'blocked');assert.equal((await repo.getJob(job.id))?.retries,2);assert.equal((await repo.getJob(job.id))?.modelRequests,3);
});

test('unrecoverable questions are saved as input needed, never invented as facts',async()=>{
 const {repo,project,job}=await setup();globalThis.fetch=async()=>response(done([call('inspect_project'),call('request_missing_information',{questions:['What are the labelled suite dimensions?']})]));assert.equal((await advanceJob(repo,env,job.id)).status,'needs_input');const saved=(await repo.getProject(project.id))!;assert.deepEqual(saved.questions,['What are the labelled suite dimensions?']);assert.equal(saved.status,'needs_input');assert.equal(saved.artifacts.length,0);
});

test('unknown tool instructions cannot send mail or grant approval',async()=>{
 const {repo,project,job}=await setup();globalThis.fetch=async()=>response(done([call('inspect_project'),call('send_email',{to:'anyone@example.com'}),call('approve_permit',{})]));await advanceJob(repo,env,job.id);const p=(await repo.getProject(project.id))!;assert.equal(p.mail.length,0);assert.equal(p.decisions.length,0);assert.equal(p.status,'running');const j=(await repo.getJob(job.id))!;const outputs=j.history.filter((i:any)=>i.type==='function_call_output') as any[];assert.match(outputs[1].output,/not available/);
});

test('official source retrieval records inaccessible sources honestly and does not follow redirects',async()=>{
 const {repo,project,job}=await setup();globalThis.fetch=async(url,init)=>{if(String(url).startsWith('https://api.meta.ai'))return response(done([call('inspect_project'),call('research_official_sources',{topics:['requirements']})]));assert.equal(init?.redirect,'manual');return new Response('Unavailable',{status:403});};await advanceJob(repo,env,job.id);const p=(await repo.getProject(project.id))!;const event=p.events.find(e=>e.type==='official_research')!;const research=JSON.parse(event.detail);assert.equal(research.sources.length,0);assert.equal(research.unavailable.length,4);
});

test('model credentials echoed in a proposed artifact are redacted before persistence',async()=>{
 const {repo,project,job}=await setup();globalThis.fetch=async()=>response(done([call('inspect_project'),call('propose_understanding',{...understanding,summary:`The key ${KEY} must never be saved.`})]));await advanceJob(repo,env,job.id);assert.ok(!JSON.stringify(await repo.getProject(project.id)).includes(KEY));assert.ok(!JSON.stringify(await repo.getJob(job.id)).includes(KEY));
});

test('per-stage time and model request limits stop before another inference',async()=>{
 for(const edit of [(j:StageJob)=>{j.startedAt=new Date(Date.now()-61*60*1000).toISOString();j.executionStartedAt=j.startedAt;},(j:StageJob)=>{j.modelRequests=12;}]){const {repo,job}=await setup();edit(job);await repo.saveJob(job);globalThis.fetch=async()=>{assert.fail('No request after limit');};assert.equal((await advanceJob(repo,env,job.id)).status,'blocked');}
});

async function readyForPreparation(){const repo=new MemoryRepository();let p=createAutoProject('owner','Fictional Portland office suite sixty feet wide and forty feet deep.');p=putArtifact(p,'understanding',understanding);p=finishStage(p);p=applyDecision(p,currentDecision(p)!.id,'approve');p=putArtifact(p,'concept',makeOfficeConcept() as unknown as Record<string,unknown>);p=putArtifact(p,'strategy',{summary:'Research needed',route:'Commercial alteration review',requirements:[],nextSteps:[],unresolved:['Professional permit drawings required.']});p=finishStage(p);p=applyDecision(p,currentDecision(p)!.id,'approve');await repo.createProject(p);const job=createStageJob(p);await repo.saveJob(job);return {repo,project:p,job};}
test('preparation automatically queues handoff work instead of asking for another run click',async()=>{
 const {repo,project,job}=await readyForPreparation();let turn=0;globalThis.fetch=async()=>response(done(++turn===1?[call('inspect_project'),call('propose_preparation',{summary:'Review coordination draft.',responses:[],missingInformation:['Professional permit drawings remain outstanding.']})]:[final()],`resp_${turn}`));
 assert.equal((await advanceJob(repo,env,job.id)).status,'advanced');assert.equal((await advanceJob(repo,env,job.id)).status,'running');const saved=(await repo.getProject(project.id))!;assert.equal(saved.stage,'handoff');assert.ok([...repo.jobs.values()].some(j=>j.stage==='handoff'&&j.status==='queued'));assert.equal((await repo.getJob(job.id))?.status,'done');
});
test('rejected feedback requires a successful fresh artifact, including when the new proposal fails validation',async()=>{
 const {repo,project}=await setup();let p=putArtifact(project,'understanding',understanding);p=finishStage(p);p=applyDecision(p,currentDecision(p)!.id,'reject','Please change the assumptions.');repo.projects.set(p.id,copy(p));const job=createStageJob(p);await repo.saveJob(job);let turn=0;globalThis.fetch=async()=>response(done(++turn===1?[call('inspect_project'),call('propose_understanding',{summary:'Invalid fields'})]:[final()],`resp_${turn}`));await advanceJob(repo,env,job.id);await advanceJob(repo,env,job.id);const saved=(await repo.getProject(p.id))!;assert.equal(saved.status,'running');assert.equal(saved.artifacts[0].revision,1);assert.equal(saved.decisions.filter(d=>d.status==='pending').length,0);
});
test('a proposed mail request uses the exact approved message binding and selected recipient',async()=>{
 const {repo,project,job}=await readyForPreparation();project.recipient={name:'Selected architect',email:'architect@example.com'};repo.projects.set(project.id,copy(project));globalThis.fetch=async()=>response(done([call('inspect_project'),call('propose_mail_request',{subject:'Please review',body:'Please confirm the existing conditions.',attachmentIds:[]})]));await advanceJob(repo,env,job.id);const saved=(await repo.getProject(project.id))!;assert.equal(saved.mail.length,1);assert.equal(saved.mail[0].to,'architect@example.com');assert.equal(saved.mail[0].status,'draft');assert.match(saved.decisions.at(-1)!.summary,/Send this exact project message/);assert.match(saved.decisions.at(-1)!.summary,/Please confirm the existing conditions/);
});
test('existing deleted disabled and user edited preference records cannot be overwritten by a model',async()=>{
 for(const extra of [{status:'disabled',deletedAt:new Date().toISOString(),text:''},{status:'disabled',text:'Earlier choice'},{status:'active',userEdited:true,text:'My corrected preference'}]){const {repo,project}=await setup();let p=putArtifact(project,'understanding',understanding);p=finishStage(p);const decision=currentDecision(p)!;p=applyDecision(p,decision.id,'reject','Use concise explanations');repo.projects.set(p.id,copy(p));const job=createStageJob(p);await repo.saveJob(job);const preference:Preference={id:`preference_${decision.id}_explanation`,ownerId:p.ownerId,scope:'project',projectId:p.id,category:'explanation',originDecisionId:decision.id,createdAt:p.createdAt,updatedAt:p.updatedAt,...extra} as Preference;await repo.putPreference(preference);globalThis.fetch=async()=>response(done([call('inspect_project'),call('propose_preference',{originDecisionId:decision.id,text:'Use concise explanations',category:'explanation',scope:'project'})]));await advanceJob(repo,env,job.id);assert.deepEqual(repo.prefs.get(preference.id),preference);const inspect=JSON.parse(((await repo.getJob(job.id))!.history.find((i:any)=>i.type==='function_call_output') as any).output);assert.equal(inspect.preferences.length,extra.status==='active'?1:0);}
});

function sqlRepository(){const sql=new DatabaseSync(':memory:');sql.exec(`CREATE TABLE auto_projects (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,version INTEGER NOT NULL,state_json TEXT NOT NULL,updated_at TEXT NOT NULL);CREATE TABLE auto_jobs (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,status TEXT NOT NULL,next_run_at TEXT NOT NULL,lease_token TEXT,lease_until INTEGER,state_json TEXT NOT NULL);CREATE TABLE auto_preferences (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,state_json TEXT NOT NULL);CREATE TABLE auto_receipts (key TEXT PRIMARY KEY,job_id TEXT NOT NULL,call_id TEXT NOT NULL,state_json TEXT NOT NULL);`);const db:D1Database={prepare(query){let args:unknown[]=[];const statement:D1Statement={bind(...values){args=values;return statement;},async first<T>(){return (sql.prepare(query).get(...args as any[])??null) as T|null;},async all<T>(){return {results:sql.prepare(query).all(...args as any[]) as T[]};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args as any[]).changes)}};}};return statement;}};return {sql,repo:createRepository({DB:db})};}
test('real SQLite repository retains the lease through model budget checkpoint and provider continuation',async()=>{
 const {sql,repo}=sqlRepository();try{const p=createAutoProject('owner','Fictional office fit-out.');await repo.createProject(p);const job=createStageJob(p);await repo.saveJob(job);let posts=0;globalThis.fetch=async(url,init)=>{if(init?.method==='POST'){posts++;const claimed=await repo.getJob(job.id);assert.ok(claimed?.leaseToken);assert.equal(claimed!.modelRequests,posts);return posts===1?response({id:'resp_pending_sql',status:'queued'}):response(done([final()],'resp_final_sql'));}return response(done([call('inspect_project'),call('propose_understanding',understanding)],'resp_pending_sql'));};assert.equal((await advanceJob(repo,env,job.id)).status,'waiting_provider');const pending=(await repo.getJob(job.id))!;assert.equal(pending.responseId,'resp_pending_sql');assert.equal(pending.leaseToken,undefined);await repo.saveJob({...pending,nextRunAt:new Date(Date.now()-100).toISOString()});assert.equal((await advanceJob(repo,env,job.id)).status,'advanced');assert.equal((await advanceJob(repo,env,job.id)).status,'needs_approval');assert.equal((await repo.getJob(job.id))?.status,'done');assert.equal((await repo.getProject(p.id))?.artifacts[0].revision,1);assert.equal(posts,2);}finally{sql.close();}
});
test('a resumed provider response recovers a saved artifact marker without duplicating its revision',async()=>{
 const {repo,project,job}=await setup();const artifact=putArtifact(project,'understanding',understanding);const result={artifactId:'understanding',artifactRevision:1,saved:true,approved:false};artifact.events.push({id:`${job.id}:tool:draft`,type:'agent_tool',detail:JSON.stringify({result}),createdAt:artifact.updatedAt});repo.projects.set(project.id,copy(artifact));job.responseId='resp_crash';job.history=[call('inspect_project')];job.completedCallIds=['success:inspect_project:inspect_project'];await repo.saveJob(job);globalThis.fetch=async()=>response(done([call('propose_understanding',understanding,'draft')],'resp_crash'));assert.equal((await advanceJob(repo,env,job.id)).status,'advanced');assert.equal((await repo.getProject(project.id))?.artifacts[0].revision,1);assert.ok((await repo.getJob(job.id))?.completedCallIds.includes('written:understanding:1'));assert.ok(await repo.getReceipt(`${job.id}:tool:draft`));
});

test('saved PDFs receive Meta file IDs automatically before inference, including unread-page warnings',async()=>{
 const {repo,project,job}=await setup();const bytes=new TextEncoder().encode('%PDF-fictional-saved-test');project.documents.push({id:'document_saved',name:'Saved condition.pdf',objectKey:'source.pdf',sha256:'a'.repeat(64),bytes:bytes.byteLength,pages:1,status:'needs_review',excerpts:[],warnings:['Page 1 has no extractable text. Review required.','Original and text excerpts saved. A server-side Meta key is required to upload this PDF for model document processing.'],createdAt:project.createdAt});repo.projects.set(project.id,copy(project));let uploads=0,inferences=0;globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/files')){uploads++;assert.ok(init?.body instanceof FormData);return response({id:'file-saved-1'});}inferences++;const input=JSON.parse(String(init?.body)).input;assert.equal(input[0].content.find((i:any)=>i.type==='input_file').file_id,'file-saved-1');return response({id:'resp_document',status:'queued'});};const fileEnv={...env,BUCKET:{async get(){return {async arrayBuffer(){return bytes.buffer;}};},async put(){}}};assert.equal((await advanceJob(repo,fileEnv,job.id)).status,'advanced');assert.equal(uploads,1);assert.equal(inferences,0);let saved=(await repo.getProject(project.id))!;assert.equal(saved.documents[0].metaFileId,'file-saved-1');assert.equal(saved.documents[0].status,'needs_review');assert.equal((await repo.getJob(job.id))?.projectVersion,saved.version);assert.equal((await advanceJob(repo,fileEnv,job.id)).status,'waiting_provider');assert.equal(uploads,1);assert.equal(inferences,1);
});
test('failed automatic PDF upload blocks before inference and preserves the registered source',async()=>{
 const {repo,project,job}=await setup();const bytes=new TextEncoder().encode('%PDF-test');project.documents.push({id:'doc',name:'source.pdf',objectKey:'source.pdf',sha256:'a'.repeat(64),bytes:bytes.byteLength,pages:1,status:'uploaded',excerpts:[],warnings:[],createdAt:project.createdAt});repo.projects.set(project.id,copy(project));globalThis.fetch=async(url)=>{assert.equal(String(url),'https://api.meta.ai/v1/files');return response({},403);};assert.equal((await advanceJob(repo,{...env,BUCKET:{async get(){return {async arrayBuffer(){return bytes.buffer;}};},async put(){}}},job.id)).status,'blocked');const saved=(await repo.getProject(project.id))!;assert.equal(saved.documents[0].objectKey,'source.pdf');assert.equal(saved.documents[0].metaFileId,undefined);assert.equal(saved.artifacts.length,0);
});
test('built-in web search executions count toward the shared stage tool limit',async()=>{
 const {repo,job}=await setup();job.toolExecutions=23;await repo.saveJob(job);globalThis.fetch=async()=>response(done([{type:'web_search_call',id:'search1'},{type:'web_search_call',id:'search2'}]));assert.equal((await advanceJob(repo,env,job.id)).status,'blocked');assert.match((await repo.getJob(job.id))!.lastError!,/tool execution limit/);
});

test('handoff feedback can reopen the design stage without another manual run',async()=>{
 const {repo,project}=await readyForPreparation();let p=putArtifact(project,'preparation',{summary:'Draft coordination',responses:[],missingInformation:['Professional review']});p=finishStage(p);await repo.createProject(p);const job=createStageJob(p);await repo.saveJob(job);const concept=makeOfficeConcept();concept.assumptions.push('Revised in response to the requested layout feedback.');globalThis.fetch=async()=>response(done([call('inspect_project'),call('propose_office_concept',concept)]));assert.equal((await advanceJob(repo,env,job.id)).status,'running');const saved=(await repo.getProject(p.id))!;assert.equal(saved.stage,'design');assert.equal(saved.artifacts.find(a=>a.kind==='concept')?.revision,2);assert.ok(saved.decisions.some(d=>d.kind==='design'&&d.status==='stale'));assert.ok([...repo.jobs.values()].some(j=>j.stage==='design'&&j.status==='queued'));
});
test('pause during a provider response preserves the response and resumes without a new model request',async()=>{const {repo,project,job}=await setup();const output=done([call('inspect_project')],'resp_pause');globalThis.fetch=async()=>{const current=(await repo.getProject(project.id))!;const paused=copy(current);paused.status='paused';paused.version++;paused.pauseState={fromVersion:current.version,targetVersion:paused.version,pausedAt:new Date().toISOString()};await repo.saveProject(paused,current.version);return response(output);};assert.equal((await advanceJob(repo,env,job.id)).status,'paused');let saved=(await repo.getJob(job.id))!;assert.equal(saved.responseId,'resp_pause');assert.equal(saved.modelRequests,1);assert.equal(saved.toolExecutions,0);const current=(await repo.getProject(project.id))!;const resumed=copy(current);resumed.version++;resumed.status='running';resumed.pauseState!.targetVersion=resumed.version;await repo.saveProject(resumed,current.version);repo.due(job.id);globalThis.fetch=async(_url,init)=>{assert.equal(init?.method,'GET');return response(output);};assert.equal((await advanceJob(repo,env,job.id)).status,'advanced');saved=(await repo.getJob(job.id))!;assert.equal(saved.modelRequests,1);assert.equal(saved.toolExecutions,1);assert.equal(repo.jobs.size,1);});
test('queue wait does not consume the execution budget before the first authorized provider request',async()=>{const {repo,job,project}=await setup();job.startedAt=new Date(Date.now()-86400000).toISOString();await repo.saveJob(job);globalThis.fetch=async()=>response(done([call('inspect_project')],'resp_after_queue'));assert.equal((await advanceJob(repo,env,job.id)).status,'advanced');const saved=(await repo.getJob(job.id))!;assert.ok(Date.parse(saved.executionStartedAt!)>Date.now()-60000);assert.equal(saved.startedAt,job.startedAt);assert.equal(saved.modelRequests,1);assert.equal((await repo.getProject(project.id))!.status,'running');});

// Independent critic phase. Main-agent and critic requests are told apart by the critic's single tool.
const criticEnv={MODEL_API_KEY:KEY};
const finding=(severity:'blocking'|'advisory')=>({severity,artifactKind:'understanding',claim:'The suite has approved office occupancy.',issue:'Occupancy is not established by the brief or any document.'});
function scripted(main:unknown[],critic:unknown[]){const seen={main:0,critic:0,mainBodies:[] as any[],criticBodies:[] as any[]};globalThis.fetch=async(url,init)=>{if(init?.method!=='POST'){const id=String(url).split('/').pop();const next=critic.shift();assert.ok(next,`Unexpected poll for ${id}`);return response(next);}const body=JSON.parse(String(init.body));if(body.tools?.[0]?.name==='record_critique'){seen.critic++;seen.criticBodies.push(body);const next=critic.shift();assert.ok(next,'Unexpected critic request');return response(next);}seen.main++;seen.mainBodies.push(body);const next=main.shift();assert.ok(next,'Unexpected agent request');return response(next);};return seen;}
async function drive(repo:MemoryRepository,jobId:string){let result;for(let i=0;i<12;i++){repo.due(jobId);result=await advanceJob(repo,criticEnv,jobId);if(!['advanced','waiting_provider'].includes(result.status))return result;}return result!;}
const draftUnderstanding=[done([call('inspect_project'),call('propose_understanding',understanding)],'resp_a'),done([final()],'resp_b')];

test('independent critic reviews the stage drafts once and records a clear result before the checkpoint',async()=>{
 const {repo,project,job}=await setup();const seen=scripted([...draftUnderstanding],[done([call('record_critique',{findings:[finding('advisory')]})],'crit_a')]);
 assert.equal((await drive(repo,job.id)).status,'needs_approval');const saved=(await repo.getProject(project.id))!;
 assert.equal(seen.critic,1);assert.equal(seen.main,2);assert.equal(seen.criticBodies[0].tools.length,1);assert.match(seen.criticBodies[0].input[0].content[0].text,/60by40foot/);
 assert.equal(saved.critiques?.length,1);assert.equal(saved.critiques![0].status,'clear');assert.equal(saved.critiques![0].findings[0].severity,'advisory');assert.deepEqual(saved.critiques![0].artifactVersions,{understanding:1});
 assert.equal(currentDecision(saved)?.kind,'understanding');assert.equal((await repo.getJob(job.id))!.modelRequests,3);
 assert.match(buildAutonomousPacket(saved),/Independent review[\s\S]*No misleading claims found/);
});

test('a blocking critique sends the agent back for exactly one revision and records the revised versions',async()=>{
 const {repo,project,job}=await setup();const revised={...understanding,assumptions:['Occupancy and permit history are unverified and require professional confirmation.']};
 const seen=scripted([...draftUnderstanding,done([call('propose_understanding',revised,'call_revise')],'resp_c'),done([final()],'resp_d')],[done([call('record_critique',{findings:[finding('blocking')]})],'crit_b')]);
 assert.equal((await drive(repo,job.id)).status,'needs_approval');const saved=(await repo.getProject(project.id))!;
 assert.equal(seen.critic,1);assert.ok(JSON.stringify(seen.mainBodies[2].input).includes('independent reviewer'));
 const critique=saved.critiques![0];assert.equal(critique.status,'revised');assert.deepEqual(critique.revisedVersions,{understanding:2});assert.ok(critique.resolvedAt);
 assert.equal(currentDecision(saved)?.artifactVersions.understanding,2);
});

test('a blocking critique the agent does not act on stays visibly unaddressed',async()=>{
 const {repo,project,job}=await setup();scripted([...draftUnderstanding,done([final('No change needed.')],'resp_c')],[done([call('record_critique',{findings:[finding('blocking')]})],'crit_c')]);
 assert.equal((await drive(repo,job.id)).status,'needs_approval');const saved=(await repo.getProject(project.id))!;assert.equal(saved.critiques![0].status,'unaddressed');assert.equal(saved.critiques![0].revisedVersions,undefined);
});

test('an exhausted model budget skips the critic without another request and records why',async()=>{
 const {repo,project,job}=await setup();job.modelRequests=10;await repo.saveJob(job);const seen=scripted([...draftUnderstanding],[]);
 assert.equal((await drive(repo,job.id)).status,'needs_approval');const saved=(await repo.getProject(project.id))!;assert.equal(seen.critic,0);assert.equal(saved.critiques![0].status,'unavailable');assert.match(saved.critiques![0].note!,/budget/);assert.equal((await repo.getJob(job.id))!.modelRequests,12);
});

test('a queued critic response is resumed by ID and unreadable output never blocks the stage',async()=>{
 const {repo,project,job}=await setup();const seen=scripted([...draftUnderstanding],[{id:'crit_wait',status:'queued'},done([final('Looks fine overall.')],'crit_wait')]);
 assert.equal((await drive(repo,job.id)).status,'needs_approval');const saved=(await repo.getProject(project.id))!;assert.equal(seen.critic,1);assert.equal(saved.critiques![0].status,'unavailable');assert.equal((await repo.getJob(job.id))!.modelRequests,3);
});

test('the critic kill switch restores the original stage flow',async()=>{
 const {repo,project,job}=await setup();const seen=scripted([...draftUnderstanding],[]);let result;for(let i=0;i<4;i++){repo.due(job.id);result=await advanceJob(repo,{...criticEnv,SCHEMA_CRITIC:'off'},job.id);if(result.status==='needs_approval')break;}
 assert.equal(result!.status,'needs_approval');assert.equal(seen.critic,0);assert.equal((await repo.getProject(project.id))!.critiques,undefined);
});

test('brief-led projects are not offered the reviewer register and cannot create one',async()=>{
 const {repo,project,job}=await setup();let tools:string[]=[];globalThis.fetch=async(_url,init)=>{tools=JSON.parse(String(init!.body)).tools.map((t:any)=>t.name).filter(Boolean);return response(done([call('inspect_project'),call('propose_review_register',{comments:[{id:'c1',number:'LS-1',wording:'Provide exit signage.',discipline:'Life safety',responsible:'Architect',parentId:null,source:{documentId:'d',page:1,quote:'Provide exit signage.'},uncertain:false}]})]));};
 assert.equal((await advanceJob(repo,env,job.id)).status,'advanced');assert.ok(!tools.includes('propose_review_register'));assert.ok(tools.includes('propose_understanding'));
 const saved=(await repo.getProject(project.id))!;assert.equal(saved.corrections,undefined);assert.equal(saved.status,'running');assert.match(JSON.stringify((await repo.getJob(job.id))!.history.at(-1)),/started from a brief/);
});

test('an incomplete critic response that still carries its tool call is read, not discarded',async()=>{
 const {repo,project,job}=await setup();scripted([...draftUnderstanding],[{id:'crit_incomplete',status:'incomplete',output:[{type:'reasoning'},call('record_critique',{findings:[finding('advisory')]})]}]);
 assert.equal((await drive(repo,job.id)).status,'needs_approval');const saved=(await repo.getProject(project.id))!;assert.equal(saved.critiques![0].status,'clear');assert.equal(saved.critiques![0].findings.length,1);
});

test('a reply cut off by the output limit before any tool call retries within budget instead of blocking',async()=>{
 const {repo,project,job}=await setup();const bodies:any[]=[];const replies=[{id:'resp_cut',status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[{type:'reasoning'}]},done([call('inspect_project')],'resp_ok')];
 globalThis.fetch=async(_url,init)=>{bodies.push(JSON.parse(String(init!.body)));return response(replies.shift());};
 assert.equal((await advanceJob(repo,env,job.id)).status,'advanced');let saved=(await repo.getJob(job.id))!;assert.equal(saved.responseId,undefined);assert.equal(saved.modelRequests,1);assert.match(JSON.stringify(saved.history.at(-1)),/output budget on reasoning/);assert.equal((await repo.getProject(project.id))!.status,'running');
 repo.due(job.id);assert.equal((await advanceJob(repo,env,job.id)).status,'advanced');saved=(await repo.getJob(job.id))!;assert.equal(saved.modelRequests,2);assert.equal(bodies[0].max_output_tokens,16000);
});

test('other incomplete replies still stop safely',async()=>{
 const {repo,project,job}=await setup();globalThis.fetch=async()=>response({id:'resp_filtered',status:'incomplete',incomplete_details:{reason:'content_filter'},output:[]});
 await advanceJob(repo,env,job.id);assert.equal((await repo.getProject(project.id))!.status,'blocked');
});
