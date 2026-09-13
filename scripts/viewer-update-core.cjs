(function(root) {
  'use strict';
  const ORIGIN='https://viewer.locahun3d.com';
  const MANIFEST_URL=ORIGIN+'/releases/stable.json';
  const MAX_HTML=64*1024*1024;
  function validateHtml(html) {
    if(!html.includes('id="locahun-app-source"') || !/<head[\s>]/i.test(html)) throw new Error('Release lacks startup fallback contract');
    const absolute=value=>{
      if(typeof value!=='string' || !/^https:\/\//.test(value))throw new Error('Release requires absolute HTTPS imports');
      const url=new URL(value);if(url.username||url.password)throw new Error('Import credentials are forbidden');
    };
    for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      const attributes=match[1];
      const src=attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
      if(src)absolute(src[1]);
      if(!/\btype\s*=\s*["']importmap["']/i.test(attributes))continue;
      const map=JSON.parse(match[2]);
      for(const value of Object.values(map.imports || {}))absolute(value);
      for(const [scope,mappings] of Object.entries(map.scopes || {})) {
        absolute(scope);for(const value of Object.values(mappings))absolute(value);
      }
    }
  }
  async function readBounded(response,limit) {
    if(!response.ok) throw new Error('Release HTTP '+response.status);
    const declared=response.headers.get('content-length');
    if(declared!==null && (!/^\d+$/.test(declared)||Number(declared)>limit)) throw new Error('Release size limit');
    if(!response.body) throw new Error('Empty release response');
    const reader=response.body.getReader(),chunks=[];let total=0;
    try {
      for(;;) {
        const {done,value}=await reader.read();if(done) break;
        total+=value.length;if(total>limit) throw new Error('Release size limit');chunks.push(value);
      }
    } catch(error) {await reader.cancel().catch(()=>{});throw error;}
    finally {reader.releaseLock();}
    const out=new Uint8Array(total);let at=0;
    for(const chunk of chunks){out.set(chunk,at);at+=chunk.length;}
    return out;
  }
  function validate(value,projectVersion) {
    if(!value || value.schema!==1 || !/^[A-Za-z0-9._-]{1,80}$/.test(value.release) ||
      !Array.isArray(value.projectVersions) || !value.projectVersions.includes(projectVersion) || value.localProjectApi!==1) throw new Error('Incompatible release manifest');
    const asset=value.viewer;
    if(!asset || !Number.isSafeInteger(asset.bytes)||asset.bytes<1||asset.bytes>MAX_HTML||!/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error('Invalid release integrity metadata');
    const url=new URL(asset.url);
    if(url.origin!==ORIGIN || url.username||url.password||url.search||url.hash ||
      !/^\/releases\/[A-Za-z0-9._-]+\/viewer\.html$/.test(url.pathname)) throw new Error('Release URL is not an official immutable viewer');
    return value;
  }
  async function check(options={}) {
    const controller=new AbortController();
    const cancel=()=>controller.abort(new Error('Release check cancelled'));
    options.signal?.addEventListener('abort',cancel,{once:true});
    if(options.signal?.aborted)cancel();
    const timer=setTimeout(()=>controller.abort(new Error('Release check timed out')),options.timeoutMs || 8000);
    try {
      const fetcher=options.fetch || root.fetch.bind(root);
      const request={signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'};
      const manifest=validate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBounded(await fetcher(MANIFEST_URL,request),32768))),options.projectVersion || 4);
      if(manifest.release===options.currentRelease) return {reason:'Current release'};
      const bytes=await readBounded(await fetcher(manifest.viewer.url,request),manifest.viewer.bytes);
      if(bytes.length!==manifest.viewer.bytes) throw new Error('Release size mismatch');
      const digest=await root.crypto.subtle.digest('SHA-256',bytes);
      const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
      if(hash!==manifest.viewer.sha256) throw new Error('Release hash mismatch');
      const html=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      validateHtml(html);
      return {html,release:manifest.release,url:manifest.viewer.url,sha256:hash};
    } catch(error) {return {reason:error.message || 'Release unavailable'};}
    finally {clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
  }
  const api={MANIFEST_URL,check,validateHtml};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.LocahunViewerUpdate=api;
})(globalThis);
