import { applyDecision, applyFeedback, buildAutonomousPacket, createAutoProject, createStageJob, putArtifact, validateProject } from '../../src/autonomy/domain';
import { validateOfficeConcept } from '../../src/autonomy/concept';
import type { AutoEnvironment, AutoProject, IntegrationStatus, Preference, Repository } from '../../src/autonomy/types';
import { createRepository, type D1Database } from './repository';
import { advanceJob, pumpJobs } from './runner';
import { ingestPdf, DocumentError } from './documents';
import { approveAndSend, mailIntegrationStatus, prepareMailAction, refreshInbox, MailError, type MailAdapter } from './mail';
const iso=()=>new Date().toISOString();
class RequestError extends Error {constructor(public status:number,message:string){super(message);}}
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function owner(request:Request){const id=request.headers.get('oai-authenticated-user-id');if(!id)throw new RequestError(401,'Sign in to your private Schema workspace to continue.');return id;}
function mutation(request:Request){if(request.headers.get('origin')!==new URL(request.url).origin)throw new RequestError(403,'This action must originate from your Schema workspace.');}
async function body(request:Request){if(!request.headers.get('content-type')?.startsWith('application/json'))throw new RequestError(415,'Send a JSON request.');const reader=request.body?.getReader();let size=0,text='';const decoder=new TextDecoder();if(reader){try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>100000){await reader.cancel();throw new RequestError(413,'This request is too large.');}text+=decoder.decode(p.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}}try{const b=JSON.parse(text||'{}');if(!b||typeof b!=='object'||Array.isArray(b))throw 0;return b as Record<string,unknown>;}catch{throw new RequestError(400,'The request could not be read.');}}
function string(value:unknown,max:number){if(typeof value!=='string'||!value.trim()||value.length>max)throw new RequestError(400,'Complete the required text within the supported limit.');return value.trim();}
async function owned(repo:Repository,id:string,userId:string){const p=await repo.getProject(id);if(!p||p.ownerId!==userId)throw new RequestError(404,'Project not found in this workspace.');return validateProject(p);}
async function save(repo:Repository,old:AutoProject,next:AutoProject){validateProject(next);if(!await repo.saveProject(next,old.version))throw new RequestError(409,'The project changed. Refresh and review its current state.');return next;}
function edit(p:AutoProject,type:string,detail:string){const next=structuredClone(p);next.version++;next.updatedAt=iso();next.events.push({id:crypto.randomUUID(),type,detail,createdAt:iso()});return next;}
async function queue(repo:Repository,p:AutoProject){if(p.status==='running')await repo.saveJob(createStageJob(p));}
async function runtime(env:AutoEnvironment,key:string){const db=env.DB as D1Database|undefined;if(!db)return null;try{const r=await db.prepare('SELECT value_json FROM auto_runtime WHERE key = ?').bind(key).first<{value_json:string}>();return r?JSON.parse(r.value_json):null;}catch{return null;}}
export async function integrations(env:AutoEnvironment):Promise<IntegrationStatus>{const state=await runtime(env,'background');return {metaConfigured:typeof env.MODEL_API_KEY==='string'&&!!env.MODEL_API_KEY.trim(),storageReady:!!env.DB&&!!env.BUCKET,gmail:mailIntegrationStatus(env),background:{configured:env.SCHEMA_BACKGROUND_CONFIGURED==='true',lastTickAt:state?.lastTickAt??null,verified:env.SCHEMA_BACKGROUND_VERIFIED==='true'},limits:{modelRequests:12,toolExecutions:24,minutes:60}};}
async function materializeMail(repo:Repository,p:AutoProject){if(p.status==='running')return p;const prep=p.artifacts.find(a=>a.kind==='preparation');const draft=prep?.data.draftEmail as Record<string,unknown>|undefined;if(!p.recipient||!draft||typeof draft.subject!=='string'||typeof draft.body!=='string')return p;const sourceKey=`prepared_mail:${prep!.revision}:${p.recipient.email}`;if(p.events.some(e=>e.type==='mail_prepared'&&e.detail===sourceKey))return p;let next=prepareMailAction(p,{to:p.recipient.email,subject:draft.subject,body:draft.body,attachmentIds:[]});next.events.push({id:crypto.randomUUID(),type:'mail_prepared',detail:sourceKey,createdAt:iso()});return save(repo,p,next);}
export async function handleAutonomyApi(request:Request,env:AutoEnvironment,repository?:Repository):Promise<Response>{
 try{
 const userId=owner(request), url=new URL(request.url), path=url.pathname.replace(/\/$/,'');
 if(!['GET','POST','DELETE'].includes(request.method))throw new RequestError(405,'Method not allowed.');
 if(request.method!=='GET')mutation(request);
 const repo=repository??createRepository(env);
 if(path==='/api/autonomy/state'&&request.method==='GET')return json({projects:await repo.listProjects(userId),preferences:(await repo.getPreferences(userId)).filter(p=>!p.deletedAt),integrations:await integrations(env)});
 if(path==='/api/autonomy/projects'&&request.method==='POST'){
 const data=await body(request);const project=createAutoProject(userId,string(data.brief,12000));await repo.createProject(project);await queue(repo,project);return json({project},201);
 }
 const pref=path.match(/^\/api\/autonomy\/preferences\/([^/]+)$/);
 if(pref){const p=(await repo.getPreferences(userId)).find(v=>v.id===pref[1]&&!v.deletedAt);if(!p)throw new RequestError(404,'Preference not found.');if(request.method==='DELETE'){await repo.putPreference({...p,text:'',status:'disabled',deletedAt:iso(),updatedAt:iso()});return new Response(null,{status:204});}if(request.method==='POST'){const data=await body(request);const next:Preference={...p,updatedAt:iso(),userEdited:true};if(data.text!==undefined)next.text=string(data.text,1000);if(data.status!==undefined){if(!['active','disabled','provisional'].includes(String(data.status)))throw new RequestError(400,'Unsupported preference status.');next.status=data.status as Preference['status'];}await repo.putPreference(next);return json({preference:next});}throw new RequestError(405,'Method not allowed.');}
 const match=path.match(/^\/api\/autonomy\/projects\/([^/]+)(?:\/(.*))?$/);if(!match)throw new RequestError(404,'Route not found.');
 let project=await owned(repo,match[1],userId);const action=match[2]??'';
 if(!action&&request.method==='GET')return json({project,preferences:(await repo.getPreferences(userId)).filter(p=>!p.deletedAt),integrations:await integrations(env)});
 if(action==='packet'&&request.method==='GET')return new Response(buildAutonomousPacket(project),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Disposition':'attachment; filename="schema-project-handoff.html"','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"}});
 if(action==='bundle'&&request.method==='GET')return json({project,preferences:(await repo.getPreferences(userId)).filter(p=>!p.deletedAt&&(p.projectId===project.id||p.scope==='reusable'))});
 if(request.method!=='POST')throw new RequestError(405,'Method not allowed.');
 if(action==='documents'){
 const contentLength=Number(request.headers.get('content-length')||0);if(contentLength>10*1024*1024+100000)throw new RequestError(413,'PDF files must be no larger than 10 MB.');
 if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))throw new RequestError(415,'Choose a PDF file.');
 const parts:Uint8Array[]=[];let total=0;const reader=request.body?.getReader();if(!reader)throw new RequestError(400,'Choose a PDF file.');try{while(true){const chunk=await reader.read();if(chunk.done)break;total+=chunk.value.byteLength;if(total>10*1024*1024+100000){await reader.cancel();throw new RequestError(413,'PDF uploads must be no larger than 10 MB.');}parts.push(chunk.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
 const form=await new Response(bytes,{headers:{'content-type':request.headers.get('content-type')!}}).formData();if([...form.keys()].length!==1||!form.has('file'))throw new RequestError(400,'Upload one PDF file at a time.');const file=form.get('file');if(!file||typeof file==='string')throw new RequestError(400,'Choose a PDF file.');
 project=await ingestPdf(repo,env,project,file as File);await queue(repo,project);return json({project});
 }
 if(action==='advance'){
 if(project.status==='running'){const jobs=(await repo.runnableJobs(100)).filter(j=>j.projectId===project.id);if(jobs.length)await advanceJob(repo,env,jobs[0].id);}
 project=await owned(repo,project.id,userId);project=await materializeMail(repo,project);return json({project});
 }
 if(action==='inbox-refresh'){project=await refreshInbox(repo,project,mailIntegrationStatus(env).connected?env.SCHEMA_GMAIL_ADAPTER as MailAdapter:undefined);return json({project});}
 const data=await body(request);
 if(action==='message'){const next=applyFeedback(project,string(data.text,8000));project=await save(repo,project,next);await queue(repo,project);return json({project});}
 if(action==='recipient'){const name=typeof data.name==='string'?data.name.trim().slice(0,200):'',email=string(data.email,254);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new RequestError(400,'Enter a valid project recipient address.');const next=edit(project,'recipient_selected','The user selected a project recipient. No message has been sent.');next.recipient={name,email};for(const mail of next.mail)if(!['sent','uncertain'].includes(mail.status)){mail.status='stale';const d=next.decisions.find(d=>d.id===mail.decisionId);if(d)d.status='stale';}project=await save(repo,project,next);project=await materializeMail(repo,project);await queue(repo,project);return json({project});}
 if(action==='concept'){let concept;try{concept=validateOfficeConcept(data.concept);}catch{throw new RequestError(400,'The office concept does not pass the geometric checks. Keep rooms, doors, and circulation inside the suite without overlap.');}const next=putArtifact(project,'concept',concept as unknown as Record<string,unknown>);next.messages.push({id:crypto.randomUUID(),role:'user',text:'I edited the current office concept. Preserve these edits when preparing the revised design checkpoint unless I request another change.',createdAt:iso()});project=await save(repo,project,next);await queue(repo,project);return json({project});}
 if(action==='pause'){
 if(typeof data.paused!=='boolean')throw new RequestError(400,'Choose pause or resume.');
 if(data.paused&&project.status!=='running')throw new RequestError(409,'This project is already stopped at a checkpoint. Review the current decision or answer its questions.');
 if(!data.paused&&project.status!=='paused')throw new RequestError(409,'Only a paused agent stage can be resumed.');
 const next=edit(project,data.paused?'paused':'resumed',data.paused?'Agent work paused by the user. Saved model progress and execution limits are preserved.':'Agent work resumed with its saved model progress and execution limits.');
 next.status=data.paused?'paused':'running';
 const fromVersion=project.pauseState?.targetVersion===project.version?project.pauseState.fromVersion:project.version;
 next.pauseState={fromVersion,targetVersion:next.version,pausedAt:data.paused?iso():project.pauseState?.pausedAt??iso()};
 project=await save(repo,project,next);
 // Pause/resume does not enqueue a new job or reset stage budgets. The existing
 // runner can rebase only across this exact recorded control-only transition.
 return json({project});
 }
 const decision=action.match(/^decisions\/([^/]+)$/);
 if(decision){if(data.choice!=='approve'&&data.choice!=='reject')throw new RequestError(400,'Choose approve or request changes.');const target=project.decisions.find(d=>d.id===decision[1]);if(target?.kind==='external')throw new RequestError(400,'Review and approve this exact external action using its send control.');let next:AutoProject;try{next=applyDecision(project,decision[1],data.choice,typeof data.feedback==='string'?data.feedback:'');}catch{throw new RequestError(409,'This checkpoint changed or still needs information. Review the current proposal.');}project=await save(repo,project,next);await queue(repo,project);return json({project});}
 const mail=action.match(/^mail\/([^/]+)\/send$/);
 if(mail){const decisionId=string(data.decisionId,180);if(!Number.isSafeInteger(data.actionRevision))throw new RequestError(400,'Review the current message revision.');project=await approveAndSend(repo,project,mail[1],decisionId,Number(data.actionRevision),mailIntegrationStatus(env).connected?env.SCHEMA_GMAIL_ADAPTER as MailAdapter:undefined);return json({project});}
 throw new RequestError(404,'Route not found.');
 }catch(error){if(error instanceof RequestError||error instanceof MailError||error instanceof DocumentError)return json({error:error.message},error.status);return json({error:'Schema could not complete this action. Saved project records are preserved.'},500);}
}
export async function handleAutonomyMcp(request:Request,env:AutoEnvironment):Promise<Response>{
 // Sites dispatch authenticates this owner-private endpoint, including scheduled service access.
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 try{const input=await body(request);const id=input.id??null;const reply=(result:unknown)=>json({jsonrpc:'2.0',id,result});
 if(input.method==='server/discover')return reply({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
 if(input.method==='initialize')return reply({protocolVersion:'2026-07-28',capabilities:{tools:{}},serverInfo:{name:'Schema project runner',version:'1.0.0'}});
 if(input.method==='notifications/initialized')return new Response(null,{status:202});
 const listing=[{name:'advance_authorized_projects',description:'Advance already-authorized Schema project stages. Stops at approvals, missing evidence and run limits. Never sends messages or submits permits.',inputSchema:{type:'object',properties:{},additionalProperties:false}},{name:'runner_status',description:'Read background runner and integration status without advancing or approving work.',inputSchema:{type:'object',properties:{},additionalProperties:false}}];
 if(input.method==='tools/list')return reply({tools:listing});
 if(input.method==='tools/call'){const params=input.params as {name?:string;arguments?:unknown};if(!params||!listing.some(t=>t.name===params.name))throw new RequestError(400,'Unknown tool.');if(params.arguments&&Object.keys(params.arguments as object).length)throw new RequestError(400,'This tool accepts no arguments.');if(params.name==='runner_status')return reply({content:[{type:'text',text:JSON.stringify(await integrations(env))}]});
 const result=await pumpJobs(createRepository(env),env,2);const db=env.DB as D1Database;const state={lastTickAt:iso()};await db.prepare('INSERT INTO auto_runtime (key,value_json,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at').bind('background',JSON.stringify(state),iso()).run();
 return reply({content:[{type:'text',text:JSON.stringify({result,...state})}]});}
 return json({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});
 }catch{return json({jsonrpc:'2.0',id:null,error:{code:-32603,message:'The background step could not finish. No approval or external action was inferred.'}},500);}
}
