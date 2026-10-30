import assert from 'node:assert/strict';
import test, {afterEach} from 'node:test';
import {createAutoProject} from '../src/autonomy/domain';
import {extractPdf,ingestPdf,ensureMetaFile} from '../server/autonomy/documents';
import type {AutoEnvironment,AutoProject,Repository} from '../src/autonomy/types';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
function pdf(pages=1,text='Show existing and proposed office partitions on A101.') {
  const objects:string[]=[];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Count ${pages} /Kids [${Array.from({length:pages},(_,i)=>`${4+i*2} 0 R`).join(' ')}] >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for(let i=0;i<pages;i++){
    const content=text?`BT /F1 ${text.length>1000?'0.01':'12'} Tf 50 750 Td (${text.replace(/[\\()]/g,'\\$&')}) Tj ET`:'';
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  let body='%PDF-1.4\n';const offsets=[0];
  objects.forEach((value,i)=>{offsets.push(body.length);body+=`${i+1} 0 obj\n${value}\nendobj\n`;});
  const xref=body.length;body+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  body+=offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('');
  body+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new File([body],'office-review.pdf',{type:'application/pdf'});
}
function fixture() {
  let current=createAutoProject('owner-a','Fictional Portland office');
  const objects=new Map<string,Uint8Array>();let puts=0,saves=0;
  const repo={async getProject(){return structuredClone(current);},async saveProject(next:AutoProject,version:number){if(version!==current.version)return false;current=structuredClone(next);saves++;return true;}} as unknown as Repository;
  const env:AutoEnvironment={BUCKET:{async put(key:string,bytes:Uint8Array){puts++;objects.set(key,Uint8Array.from(bytes));},async get(key:string){const bytes=objects.get(key);return bytes?{async arrayBuffer(){return Uint8Array.from(bytes).buffer;}}:null;},async delete(key:string){objects.delete(key);}}};
  return {repo,env,objects,get project(){return structuredClone(current);},get puts(){return puts;},get saves(){return saves;},setCurrent(value:AutoProject){current=value;}};
}
test('text PDF extraction preserves actual page numbers and exact normalized text',async()=>{
 const result=await extractPdf(new Uint8Array(await pdf(2).arrayBuffer()));
 assert.equal(result.pages,2);assert.deepEqual(result.excerpts.map(e=>e.page),[1,2]);
 assert.equal(result.excerpts[0].text,'Show existing and proposed office partitions on A101.');
 assert.equal(result.warnings.length,0);
});
test('image-only or blank pages remain explicitly unverified',async()=>{
 const result=await extractPdf(new Uint8Array(await pdf(1,'').arrayBuffer()));
 assert.equal(result.pages,1);assert.deepEqual(result.excerpts,[]);assert.match(result.warnings[0],/Page 1.*no extractable text/);
});
test('page limits and invalid PDFs fail before storage or Meta access',async()=>{
 const f=fixture();globalThis.fetch=async()=>{assert.fail('No provider call for invalid PDF');};
 await assert.rejects(()=>ingestPdf(f.repo,f.env,f.project,pdf(51)),/50 pages/);
 await assert.rejects(()=>ingestPdf(f.repo,f.env,f.project,new File(['not-pdf'],'bad.pdf',{type:'application/pdf'})),/not a PDF/);
 await assert.rejects(()=>ingestPdf(f.repo,f.env,f.project,new File(['%PDF-bad'],'bad.pdf',{type:'application/pdf'})),/could not be safely read/);
 assert.equal(f.puts,0);assert.equal(f.saves,0);
});
test('size, content type and unavailable storage fail honestly',async()=>{
 const f=fixture();
 await assert.rejects(()=>ingestPdf(f.repo,{},f.project,pdf()),/storage is unavailable/);
 await assert.rejects(()=>ingestPdf(f.repo,f.env,f.project,new File([new Uint8Array(10*1024*1024+1)],'large.pdf',{type:'application/pdf'})),/10 MB/);
 await assert.rejects(()=>ingestPdf(f.repo,f.env,f.project,new File(['%PDF-text'],'text.txt',{type:'text/plain'})),/Only PDF/);
 assert.equal(f.puts,0);
});
test('source and full extraction are saved while missing Meta key remains explicit',async()=>{
 const f=fixture();const result=await ingestPdf(f.repo,f.env,f.project,pdf());
 assert.equal(result.documents.length,1);assert.equal(result.version,2);assert.equal(result.stage,'understanding');assert.equal(f.puts,2);
 const doc=result.documents[0];assert.equal(doc.status,'processed');assert.equal(doc.metaFileId,undefined);assert.match(doc.warnings.at(-1)!,/server-side Meta key/);
 assert.equal(JSON.parse(new TextDecoder().decode(f.objects.get(doc.objectKey+'.text.json'))).excerpts[0].page,1);
});
test('duplicate source hash reuses existing record and never uploads twice',async()=>{
 const f=fixture(),file=pdf();const first=await ingestPdf(f.repo,f.env,f.project,file);
 const second=await ingestPdf(f.repo,f.env,first,file);
 assert.equal(second.version,first.version);assert.equal(second.documents.length,1);assert.equal(f.puts,2);assert.equal(f.saves,1);
});
test('explicit upload uses fixed Meta Files endpoint and validates the receipt',async()=>{
 const f=fixture();f.env.MODEL_API_KEY='test-only-meta-key';let calls=0;
 globalThis.fetch=async(input,init)=>{calls++;assert.equal(input,'https://api.meta.ai/v1/files');assert.equal(init?.redirect,'manual');const form=init?.body as FormData;assert.equal(form.get('purpose'),'user_data');assert.ok(form.get('file') instanceof File);return Response.json({id:'file-123'});};
 const result=await ingestPdf(f.repo,f.env,f.project,pdf());assert.equal(result.documents[0].metaFileId,'file-123');assert.equal(calls,1);
 await ingestPdf(f.repo,f.env,result,pdf());assert.equal(calls,1);
});
test('failed provider upload preserves extracted source for bounded runner retry',async()=>{
 const f=fixture();f.env.MODEL_API_KEY='test-only-meta-key';
 globalThis.fetch=async()=>new Response('secret provider details',{status:302,headers:{location:'https://untrusted.example'}});
 const failed=await ingestPdf(f.repo,f.env,f.project,pdf());assert.equal(failed.status,'running');assert.equal(failed.documents[0].status,'processed');assert.equal(failed.documents[0].metaFileId,undefined);assert.ok(!JSON.stringify(failed).includes('secret provider details'));
 globalThis.fetch=async()=>Response.json({id:'file-retried'});
 const result=await ensureMetaFile(f.repo,f.env,failed,failed.documents[0].id);assert.equal(result.documents[0].metaFileId,'file-retried');assert.equal(result.status,'running');
});
test('eight document limit and concurrent project edits cannot silently overwrite state',async()=>{
 const f=fixture();const original=f.project;original.documents=Array.from({length:8},(_,i)=>({id:`doc-${i}`,name:`x${i}.pdf`,objectKey:`k${i}`,sha256:`hash${i}`,bytes:10,pages:1,status:'processed' as const,excerpts:[],warnings:[],createdAt:new Date().toISOString()}));f.setCurrent(original);
 await assert.rejects(()=>ingestPdf(f.repo,f.env,original,pdf()),/eight PDF/);
 const second=fixture();const stale=second.project;second.setCurrent({...stale,version:2});
 await assert.rejects(()=>ingestPdf(second.repo,second.env,stale,pdf()),/project changed/);assert.equal(second.puts,0);
});

test('long-page coverage is explicitly limited while complete extracted text remains in R2',async()=>{
 const f=fixture();const source='A'.repeat(40_000);
 const result=await ingestPdf(f.repo,f.env,f.project,pdf(2,source));
 const doc=result.documents[0];assert.equal(doc.status,'needs_review');
 assert.ok(new TextEncoder().encode(doc.excerpts.map(e=>e.text).join('')).length<=60_000);
 assert.ok(doc.warnings.some(w=>w.includes('text exceeds the excerpt budget')));
 const full=JSON.parse(new TextDecoder().decode(f.objects.get(doc.objectKey+'.text.json')));
 assert.equal(full.excerpts.length,2);assert.equal(full.excerpts[0].text.length,source.length);
});
test('aggregate project budget is checked before source writes or provider access',async()=>{
 const f=fixture();const project=f.project;
 project.messages=Array.from({length:48},(_,i)=>({id:`m${i}`,role:'user' as const,text:'B'.repeat(12_000),createdAt:new Date().toISOString()}));
 f.setCurrent(project);
 await assert.rejects(()=>ingestPdf(f.repo,f.env,project,pdf(1,'A'.repeat(40_000))),/text register is full/);
 assert.equal(f.puts,0);assert.equal(f.saves,0);
});
