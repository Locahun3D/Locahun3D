import {createHash} from 'node:crypto';

// Desktop workflow only. Origin approval comes from trusted configuration, never an asset response.
export async function verifyUploadedExport({url,allowedOrigins,bytes,sha256,timeoutMs=120000,fetch:fetcher=globalThis.fetch}){
 const target=new URL(url);
 if(!Array.isArray(allowedOrigins)||!allowedOrigins.includes(target.origin)||target.username||target.password||target.hash||
    !(target.protocol==='https:'||target.protocol==='http:'&&['127.0.0.1','[::1]'].includes(target.hostname)))throw Error('Unapproved asset origin');
 if(!Number.isSafeInteger(bytes)||bytes<1||bytes>2*1024**3||!/^[a-f0-9]{64}$/.test(sha256)||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000)throw Error('Invalid archive verification limits');
 const controller=new AbortController();let reader,timer,expired=false;
 const cancel=()=>{try{Promise.resolve(reader?.cancel()).catch(()=>{});}catch{ /* Cancellation cannot extend the deadline. */ }};
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{
  expired=true;controller.abort();cancel();reject(Error('Archive verification deadline exceeded'));
 },timeoutMs);});
 const operation=(async()=>{
  const response=await fetcher(target.href,{redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal});
  if(expired){void response.body?.cancel().catch(()=>{});throw Error('Archive verification deadline exceeded');}
  reader=response.body?.getReader();
  if(response.status!==200||response.redirected||response.url&&new URL(response.url).href!==target.href||!reader)throw Error('Unexpected archive response');
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)!==bytes))throw Error('Archive response size mismatch');
  const hash=createHash('sha256');let count=0;
  while(!expired){
   const item=await reader.read();if(expired)throw Error('Archive verification deadline exceeded');
   if(item.done)break;
   if(!(item.value instanceof Uint8Array))throw Error('Invalid archive stream');
   count+=item.value.byteLength;if(count>bytes)throw Error('Archive exceeds expected size');hash.update(item.value);
  }
  if(count!==bytes)throw Error('Incomplete archive');
  const actual=hash.digest('hex');if(actual!==sha256)throw Error('Archive digest mismatch');
  return {bytes:count,sha256:actual};
 })();
 try{return await Promise.race([operation,deadline]);}
 finally{clearTimeout(timer);controller.abort();cancel();}
}
