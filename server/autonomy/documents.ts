import { applyFeedback, validateProject } from '../../src/autonomy/domain';
import type { AutoEnvironment, AutoProject, DocumentRef, Repository } from '../../src/autonomy/types';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 50;
const MAX_EXCERPT_BYTES = 60_000;
const META_FILES = 'https://api.meta.ai/v1/files';
type Bucket = {
  put(key: string, value: Uint8Array, options?: {httpMetadata?:{contentType:string}}): Promise<unknown>;
  get(key: string): Promise<{arrayBuffer():Promise<ArrayBuffer>}|null>;
  delete(key:string):Promise<unknown>;
};
export class DocumentError extends Error {
  constructor(public status:number, public code:string, message:string) { super(message); }
}
function bucketFor(env:AutoEnvironment):Bucket {
  const value = env.BUCKET as Bucket | undefined;
  if (!value || typeof value.put !== 'function' || typeof value.get !== 'function') throw new DocumentError(503,'file_storage_unavailable','Project file storage is unavailable. Your file has not been uploaded.');
  return value;
}
function takeUtf8(text:string,maxBytes:number):string {
  let low=0,high=Math.min(30_000,text.length); const encoder=new TextEncoder();
  while(low<high){const mid=Math.ceil((low+high)/2);if(encoder.encode(text.slice(0,mid)).length<=maxBytes)low=mid;else high=mid-1;}
  if(low>0&&low<text.length&&/[\uD800-\uDBFF]/.test(text[low-1]))low--;
  return text.slice(0,low);
}
function filename(name:string) {
  return name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,200) || 'project-document.pdf';
}
async function boundedJson(response:Response):Promise<Record<string,unknown>> {
  if (!response.body) throw new Error('Empty response');
  const reader=response.body.getReader(), decoder=new TextDecoder(); let raw='', bytes=0;
  try { while(true) {const part=await reader.read(); if(part.done)break; bytes+=part.value.byteLength; if(bytes>65_536){await reader.cancel();throw new Error('Response too large');} raw+=decoder.decode(part.value,{stream:true});} raw+=decoder.decode(); return JSON.parse(raw); }
  finally {reader.releaseLock();}
}
async function uploadToMeta(bytes:Uint8Array,name:string,key:string):Promise<string> {
  if (key.length<8 || key.length>4096 || /\s/.test(key)) throw new DocumentError(400,'invalid_meta_key','The configured Meta credential has an invalid format.');
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),20_000);
  try {
    const form=new FormData(); form.set('purpose','user_data');
    form.set('file',new File([Uint8Array.from(bytes)],name,{type:'application/pdf'}));
    let response:Response;
    try {response=await fetch(META_FILES,{method:'POST',redirect:'manual',signal:controller.signal,headers:{authorization:`Bearer ${key}`},body:form});}
    catch {throw new DocumentError(controller.signal.aborted?504:502,'meta_file_upload_failed','The original file is saved, but Meta could not receive it. Retry the upload after checking the connection.');}
    if(!response.ok){await response.body?.cancel();throw new DocumentError(response.status===401||response.status===403?401:502,'meta_file_upload_failed','The original file is saved, but Meta rejected the file upload. Check account access and retry.');}
    let result:Record<string,unknown>; try {result=await boundedJson(response);}catch{throw new DocumentError(502,'meta_file_upload_failed','Meta returned an unreadable file receipt. The original file remains saved.');}
    if(typeof result.id!=='string'||!/^file-[A-Za-z0-9_-]{1,180}$/.test(result.id)) throw new DocumentError(502,'meta_file_upload_failed','Meta did not return a valid file receipt. The original file remains saved.');
    return result.id;
  } finally {clearTimeout(timer);}
}

/** PDF.js text extraction only; never render or execute document scripts. */
export async function extractPdf(bytes:Uint8Array):Promise<{pages:number;excerpts:{page:number;text:string}[];fullExcerpts:{page:number;text:string}[];warnings:string[]}> {
  let task:{promise:Promise<any>;destroy():Promise<void>}|undefined;
  try {
    // Worker runtimes do not provide a canvas DOMMatrix. This inert constructor
    // is used only by PDF.js's unused canvas module initialization; rendering is disabled.
    if (!('DOMMatrix' in globalThis)) Object.defineProperty(globalThis,'DOMMatrix',{configurable:true,value:class TextExtractionMatrix {}});
    // @ts-expect-error PDF.js worker bundle intentionally has no declaration file.
    const worker=await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    Object.defineProperty(globalThis,'pdfjsWorker',{configurable:true,value:worker});
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
    task=pdfjs.getDocument({data:Uint8Array.from(bytes),useWorkerFetch:false,disableFontFace:true,useSystemFonts:false,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,stopAtErrors:true});
    const pdf=await task.promise;
    if(pdf.numPages>MAX_PAGES)throw new DocumentError(413,'pdf_page_limit','PDFs are limited to 50 pages. Split the drawing set into smaller files; no pages were silently skipped.');
    if(pdf.numPages<1)throw new DocumentError(400,'invalid_pdf','The PDF contains no readable pages.');
    const excerpts:{page:number;text:string}[]=[], fullExcerpts:{page:number;text:string}[]=[], warnings:string[]=[]; let remaining=MAX_EXCERPT_BYTES, fullTextBytes=0;
    for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
      const page=await pdf.getPage(pageNumber);
      try {
        const content=await page.getTextContent({disableNormalization:false});
        const full=content.items.map((item:{str?:string;hasEOL?:boolean})=>typeof item.str==='string'?item.str+(item.hasEOL?'\n':' '):'').join('').replace(/\s+/g,' ').trim();
        fullTextBytes+=new TextEncoder().encode(full).length; if(fullTextBytes>2_000_000)throw new DocumentError(413,'pdf_text_limit','The PDF expands beyond the safe text-processing limit. Split it into smaller documents.');
        fullExcerpts.push({page:pageNumber,text:full});
        if(!full){warnings.push(`Page ${pageNumber} has no extractable text. Scanned or image-only content requires review; it is not verified evidence.`);continue;}
        const text=takeUtf8(full,remaining);
        if(text)excerpts.push({page:pageNumber,text});
        remaining-=new TextEncoder().encode(text).length;
        if(text.length<full.length)warnings.push(`Page ${pageNumber} text exceeds the excerpt budget. Its complete content has not been verified in the text register.`);
      } finally {page.cleanup();}
    }
    return {pages:pdf.numPages,excerpts,fullExcerpts,warnings};
  } catch(error){
    if(error instanceof DocumentError)throw error;
    throw new DocumentError(400,'invalid_pdf','This PDF could not be safely read. Use an unlocked, text-bearing PDF; no document was registered.');
  } finally {try{await task?.destroy();}catch{}}
}

/** Explicit upload sends only the provided PDF to the fixed Meta Files endpoint. */
export async function ingestPdf(repo:Repository,env:AutoEnvironment,project:AutoProject,file:File):Promise<AutoProject> {
  const original=validateProject(project), bucket=bucketFor(env);
  if(!(file instanceof File)||file.size<5)throw new DocumentError(400,'invalid_pdf','Choose a nonempty PDF file.');
  if(file.size>MAX_BYTES)throw new DocumentError(413,'pdf_size_limit','PDFs are limited to 10 MB per file.');
  if(file.type && !['application/pdf','application/octet-stream'].includes(file.type))throw new DocumentError(415,'pdf_type_required','Only PDF project files are supported.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw new DocumentError(400,'invalid_pdf','The selected file is not a PDF.');
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  const existing=original.documents.find(doc=>doc.sha256===sha256);
  if(existing){
    if(existing.metaFileId||!env.MODEL_API_KEY)return original;
    return ensureMetaFile(repo,env,original,existing.id,bytes);
  }
  if(original.documents.length>=8)throw new DocumentError(409,'document_limit','A project supports up to eight PDF files.');
  const extracted=await extractPdf(bytes);
  const current=await repo.getProject(original.id);
  if(!current||current.ownerId!==original.ownerId||current.version!==original.version)throw new DocumentError(409,'project_changed','The project changed while the PDF was being read. Upload it again against the current project.');
  const doc:DocumentRef={id:`document_${crypto.randomUUID()}`,name:filename(file.name),objectKey:`projects/${original.id}/documents/${sha256}.pdf`,sha256,bytes:bytes.byteLength,pages:extracted.pages,status:extracted.warnings.length?'needs_review':'processed',excerpts:extracted.excerpts,warnings:extracted.warnings.length>48?[...extracted.warnings.slice(0,48),'Additional page review warnings are recorded in the saved extraction file.']:extracted.warnings,createdAt:new Date().toISOString()};
  const next=original.corrections?structuredClone(original):applyFeedback(original,`New project file received: ${doc.name}. Reassess project understanding using this untrusted source.`);
  if(original.corrections){next.version++;next.updatedAt=new Date().toISOString();next.messages.push({id:crypto.randomUUID(),role:'system',text:`New source ${doc.name} is available. Reassess affected responses; uploading a file alone does not replace existing evidence or authorize submission.`,createdAt:next.updatedAt});}
  else{next.stage='understanding';for(const decision of next.decisions)if(decision.status==='pending'||decision.status==='approved')decision.status='stale';for(const mail of next.mail)if(!['sent','sending','uncertain'].includes(mail.status))mail.status='stale';}
  next.documents.push(doc);
  next.events.push({id:`event_${crypto.randomUUID()}`,type:'document_registered',detail:`Registered ${doc.name}, ${doc.pages} pages, with ${doc.excerpts.length} text-bearing pages. Source pages remain separate from verified project facts.`,createdAt:new Date().toISOString()});
  validateProject(next);
  if(new TextEncoder().encode(JSON.stringify(next)).length>600_000)throw new DocumentError(413,'project_text_limit','The project text register is full. Split the work into another project; the existing project and source files have not been changed.');
  try {await bucket.put(doc.objectKey,bytes,{httpMetadata:{contentType:'application/pdf'}}); await bucket.put(doc.objectKey+'.text.json',new TextEncoder().encode(JSON.stringify({pages:extracted.pages,excerpts:extracted.fullExcerpts,warnings:extracted.warnings})),{httpMetadata:{contentType:'application/json'}});}catch{throw new DocumentError(503,'file_storage_failed','The PDF could not be saved to project storage. No document was registered.');}
  if(env.MODEL_API_KEY){
    try{doc.metaFileId=await uploadToMeta(bytes,doc.name,env.MODEL_API_KEY);}
    catch(error){doc.warnings.push('Meta upload: '+(error instanceof DocumentError?error.message:'File upload did not complete. The agent will retry the saved source within its execution limits.'));}
  } else doc.warnings.push('Original and text excerpts saved. A server-side Meta key is required to upload this PDF for model document processing.');
  if(!await repo.saveProject(validateProject(next),original.version))throw new DocumentError(409,'project_changed','The file was saved, but the project changed before it could be registered. Retry to reconcile it with the current project.');
  return next;
}

/** Retry a saved PDF receipt without asking for another source-file upload. */
export async function ensureMetaFile(repo:Repository,env:AutoEnvironment,project:AutoProject,documentId:string,providedBytes?:Uint8Array):Promise<AutoProject> {
  if(!env.MODEL_API_KEY)throw new DocumentError(409,'meta_not_configured','Configure the server Meta key to process the saved PDF.');
  const original=validateProject(project), doc=original.documents.find(candidate=>candidate.id===documentId);
  if(!doc)throw new DocumentError(404,'document_not_found','This document is not registered to the project.');
  if(doc.metaFileId)return original;
  const bucket=bucketFor(env), stored=providedBytes?null:await bucket.get(doc.objectKey);
  if(!providedBytes&&!stored)throw new DocumentError(409,'source_file_missing','The registered source PDF is missing from storage. Upload it again.');
  const bytes=providedBytes||new Uint8Array(await stored!.arrayBuffer());
  const fileId=await uploadToMeta(bytes,doc.name,env.MODEL_API_KEY);
  const next=structuredClone(original), target=next.documents.find(candidate=>candidate.id===doc.id)!;
  target.metaFileId=fileId;target.warnings=target.warnings.filter(w=>!w.startsWith('Original and text excerpts saved.')&&!w.startsWith('Meta upload:'));
  target.status=target.warnings.length?'needs_review':'processed';
  next.version++;next.updatedAt=new Date().toISOString();
  if(next.status==='blocked'&&next.blockedReason==='The original PDF is saved, but its Meta file upload needs attention.'){next.status='running';delete next.blockedReason;}
  next.events.push({id:`event_${crypto.randomUUID()}`,type:'document_uploaded_to_meta',detail:`Meta returned a file receipt for ${target.name}. Document content still requires evidence-based review.`,createdAt:next.updatedAt});
  if(!await repo.saveProject(validateProject(next),original.version))throw new DocumentError(409,'project_changed','The project changed while Meta received the PDF. Refresh before trying again.');
  return next;
}
