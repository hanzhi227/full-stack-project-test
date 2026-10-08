import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../apps/api/src/app';
import { AppError } from '../apps/api/src/server/errors';
import { MAX_FILE_BYTES, type DocumentSummary } from '@document-qa/contracts';
import { pdfFixture } from './pdf-fixture';
process.env.SESSION_SIGNING_SECRET = 'api-test-secret-not-for-production'.repeat(2);
process.env.APP_ORIGIN = 'http://localhost:3000';
const origin = process.env.APP_ORIGIN;
function fixture() {
 const documents = new Map<string, DocumentSummary[]>(); const texts: string[] = []; let answers = 0;
 const app = createApp({
  listDocuments: async workspace => documents.get(workspace) ?? [],
  ingestDocument: async ({workspaceId, name, text}) => { texts.push(text); const document={id:randomUUID(),name,chunkCount:1}; documents.set(workspaceId,[...documents.get(workspaceId)??[],document]); return document; },
  answerQuestion: async () => { answers++; return {status:'answered',answer:'Keep the receipt.',citations:[],requestId:randomUUID()}; }
 });
 return {app,documents,texts,answers:()=>answers};
}
async function multipart(bytes: Uint8Array|string, name='handbook.md') {
 const form=new FormData(); form.set('file',new File([typeof bytes==='string' ? bytes : new Uint8Array(bytes)],name));
 const request=new Request('http://localhost',{method:'POST',body:form});
 return {payload:Buffer.from(await request.arrayBuffer()),headers:{origin,'content-type':request.headers.get('content-type')!}};
}
test('Fastify upload, list, cookie and ask preserve ownership across sessions',async t=>{
 const {app,answers}=fixture(); t.after(()=>app.close());
 const first=await app.inject({method:'GET',url:'/api/documents'});
 assert.equal(first.statusCode,200); assert.deepEqual(first.json(),{documents:[]});
 const setCookie=String(first.headers['set-cookie']);
 assert.match(setCookie,/HttpOnly/); assert.match(setCookie,/SameSite=Lax/); assert.doesNotMatch(setCookie,/Domain=/i);
 const cookie=setCookie.split(';')[0];
 const file=await multipart('Keep receipts.');
 const indexed=await app.inject({method:'POST',url:'/api/documents',...file,headers:{...file.headers,cookie}});
 assert.equal(indexed.statusCode,201);
 const id=indexed.json().document.id;
 assert.equal((await app.inject({url:'/api/documents',headers:{cookie}})).json().documents[0].id,id);
 assert.deepEqual((await app.inject({url:'/api/documents'})).json().documents,[]);
 const payload={question:'What must I keep?',documentIds:[id],history:[]};
 const denied=await app.inject({method:'POST',url:'/api/ask',headers:{origin},payload});
 assert.equal(denied.statusCode,404); assert.equal(denied.json().error.code,'DOCUMENT_NOT_FOUND'); assert.equal(answers(),0);
 const allowed=await app.inject({method:'POST',url:'/api/ask',headers:{origin,cookie},payload});
 assert.equal(allowed.statusCode,200); assert.equal(allowed.json().status,'answered'); assert.equal(answers(),1);
 assert.equal(allowed.headers['cache-control'],'no-store');
});
test('Fastify rejects cross-origin mutations, forged workspace fields, and malformed JSON',async t=>{
 const {app,answers}=fixture(); t.after(()=>app.close());
 const payload={question:'Policy?',documentIds:[randomUUID()],history:[]};
 const badOrigin=await app.inject({method:'POST',url:'/api/ask',headers:{origin:'https://evil.example'},payload});
 assert.equal(badOrigin.statusCode,403);
 const forged=await app.inject({method:'POST',url:'/api/ask',headers:{origin},payload:{...payload,workspaceId:randomUUID()}});
 assert.equal(forged.statusCode,400);
 const invalid=await app.inject({method:'POST',url:'/api/ask',headers:{origin,'content-type':'application/json'},payload:'{'});
 assert.equal(invalid.statusCode,400); assert.ok(invalid.json().requestId); assert.equal(answers(),0);
});
test('Fastify enforces actual body sizes, format and UTF-8 before ingestion',async t=>{
 const {app,documents}=fixture(); t.after(()=>app.close());
 const oversized=await app.inject({method:'POST',url:'/api/ask',headers:{origin,'content-type':'application/json'},payload:'x'.repeat(64_001)});
 assert.equal(oversized.statusCode,413); assert.equal(oversized.json().error.code,'REQUEST_TOO_LARGE');
 for(const [bytes,name,code] of [[new Uint8Array([255]),'bad.txt','INVALID_ENCODING'],['','empty.md','EMPTY_DOCUMENT'],['Text','file.pdf','INVALID_FILE'],['Text','file.docx','INVALID_FILE'],[pdfFixture(''),'blank.pdf','EMPTY_DOCUMENT'],['%PDF-1.4\ninvalid','broken.pdf','INVALID_FILE'],['x'.repeat(MAX_FILE_BYTES + 1),'big.txt','FILE_TOO_LARGE']] as const){
  const result=await app.inject({method:'POST',url:'/api/documents',...await multipart(bytes,name)});
  assert.equal(result.json().error.code,code);
 }
 assert.equal(documents.size,0);
});
test('Fastify extracts real PDFs and accepts the exact 50 MB upload boundary', async t => {
 const {app,texts}=fixture(); t.after(()=>app.close());
 const pdf=await app.inject({method:'POST',url:'/api/documents',...await multipart(pdfFixture(),'Guide.PDF')});
 assert.equal(pdf.statusCode,201);
 assert.equal(pdf.json().document.name,'Guide.PDF');
 assert.equal(texts[0].trim(),'Keep the receipt.');
 const large=await app.inject({method:'POST',url:'/api/documents',...await multipart('x'.repeat(MAX_FILE_BYTES),'big.txt')});
 assert.equal(large.statusCode,201);
 assert.equal(texts[1].length,MAX_FILE_BYTES);
});
test('guard/provider outages map to retryable JSON rather than returning an answer',async t=>{
 const id=randomUUID();
 const app=createApp({listDocuments:async()=>[{id,name:'handbook.md',chunkCount:1}],ingestDocument:async()=>{throw new Error('Unused');},answerQuestion:async()=>{throw new AppError('GUARD_UNAVAILABLE','A required safety check is unavailable. Try again.');}});
 t.after(()=>app.close());
 const result=await app.inject({method:'POST',url:'/api/ask',headers:{origin},payload:{question:'Policy?',documentIds:[id],history:[]}});
 assert.equal(result.statusCode,503); assert.equal(result.json().error.retryable,true); assert.equal(result.json().error.code,'GUARD_UNAVAILABLE'); assert.equal(result.json().answer,undefined);
});
