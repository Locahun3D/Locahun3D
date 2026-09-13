import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {verifyUploadedExport} from './verify-uploaded-export.mjs';
const data=Buffer.from('completed export'),sha256=createHash('sha256').update(data).digest('hex');
const base={url:'https://assets.example.test/assets/splat/a.zip',allowedOrigins:['https://assets.example.test'],bytes:data.length,sha256};
test('verifies streamed bytes without forwarding credentials',async()=>{
 const result=await verifyUploadedExport({...base,fetch:async(url,options)=>{
  assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
  return new Response(data,{headers:{'content-length':String(data.length)}});
 }});assert.deepEqual(result,{bytes:data.length,sha256});
});
test('rejects unapproved origins before fetching',async()=>{
 await assert.rejects(verifyUploadedExport({...base,url:'https://other.example/a.zip',fetch:async()=>{throw Error('must not fetch');}}),/origin/i);
});
test('rejects oversized, short, corrupted and unsuccessful downloads',async()=>{
 for(const response of [new Response(Buffer.alloc(data.length+1)),new Response('short'),new Response(Buffer.alloc(data.length)),new Response(data,{status:403}),new Response(data,{headers:{'content-length':'999999999'}})]){
  await assert.rejects(verifyUploadedExport({...base,fetch:async()=>response}));
 }
});
test('deadline is bounded even if fetch or stream cancellation ignores abort',async()=>{
 await assert.rejects(verifyUploadedExport({...base,timeoutMs:20,fetch:()=>new Promise(()=>{})}),/deadline/i);
 const response=new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){return new Promise(()=>{});}}));
 await assert.rejects(verifyUploadedExport({...base,timeoutMs:20,fetch:async()=>response}),/deadline/i);
});
test('actual HTTP stream passes while redirects are rejected without following',async t=>{
 let redirected=0;
 const server=http.createServer((req,res)=>{
  if(req.url==='/redirect'){res.writeHead(302,{location:'/unexpected'});res.end();return;}
  if(req.url==='/unexpected')redirected++;
  res.writeHead(200,{'content-type':'application/zip'});res.write(data.subarray(0,4));res.end(data.subarray(4));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
 const origin='http://127.0.0.1:'+server.address().port;
 assert.deepEqual(await verifyUploadedExport({...base,url:origin+'/archive',allowedOrigins:[origin]}),{bytes:data.length,sha256});
 await assert.rejects(verifyUploadedExport({...base,url:origin+'/redirect',allowedOrigins:[origin]}));
 assert.equal(redirected,0);
});
