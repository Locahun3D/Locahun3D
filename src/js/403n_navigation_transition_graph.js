// Shared graph codec; creates no runtime query or network request by itself.
globalThis.LocahunTransitionGraph={create(hash){
 const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s),MAX=128*1024;
 const digest=value=>hash(new TextEncoder().encode(JSON.stringify(value)));
 const order=(a,b)=>a<b?-1:a>b?1:0;
 async function binding(manifest){
  if(manifest?.schema!==1||!hex(manifest.source)||!Array.isArray(manifest.regions)||!manifest.regions.length||manifest.regions.length>1024)throw Error('Invalid graph manifest');
  const seen=new Set(),bounds=new Map(),records=[];
  for(const pair of manifest.regions){
   const entries=[];
   for(const type of ['navigation','collision']){
    const e=pair?.[type],b=e?.bounds;
    if(!e||e.source!==manifest.source||!hex(e.key)||!hex(e.sha256)||!Number.isInteger(e.bytes)||e.bytes<1||e.bytes>2000000||
     !Array.isArray(b)||b.length!==2||b.some(v=>!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isFinite(n)||Math.abs(n)>10000))||b[1].some((n,i)=>n<=b[0][i])||b[1][0]-b[0][0]>32||b[1][2]-b[0][2]>32)throw Error('Invalid graph region');
    const copy=b.map(v=>[...v]);
    if(await digest(['navigation-region-v1',e.source,copy,[2,.15,.3,.05,.025]])!==e.key)throw Error('Invalid graph region key');
    entries.push([e.key,copy,e.bytes,e.sha256]);
   }
   if(entries[0][0]!==entries[1][0]||seen.has(entries[0][0]))throw Error('Invalid graph region pair');
   seen.add(entries[0][0]);bounds.set(entries[0][0],entries[0][1]);records.push(entries);
  }
  records.sort((a,b)=>order(a[0][0],b[0][0]));
  return {key:await digest(['transition-manifest-v1',manifest.source,records]),bounds};
 }
 function normalize(portals,bounds){
  if(!Array.isArray(portals)||!portals.length||portals.length>256)throw Error('Portal count limit');
  const seen=new Set();
  return portals.map(portal=>{
   const ends=['a','b'].map(side=>{
    const e=portal?.[side],p=e?.point,b=bounds.get(e?.key);
    if(!b||!p||!['x','y','z'].every((k,i)=>Number.isFinite(p[k])&&p[k]>=b[0][i]+.35&&p[k]<=b[1][i]-.35))throw Error('Invalid portal endpoint');
    return {key:e.key,point:{x:p.x,y:p.y,z:p.z}};
   }).sort((a,b)=>order(a.key,b.key));
   if(ends[0].key===ends[1].key||Math.hypot(...['x','y','z'].map(k=>ends[0].point[k]-ends[1].point[k]))>.025)throw Error('Invalid portal crossing');
   const value={a:ends[0],b:ends[1]},id=JSON.stringify(value);if(seen.has(id))throw Error('Duplicate portal');seen.add(id);return value;
  }).sort((a,b)=>order(JSON.stringify(a),JSON.stringify(b)));
 }
 async function encode(manifest,portals){
  const input=structuredClone({manifest,portals}),bound=await binding(input.manifest);
  const value={schema:1,source:input.manifest.source,manifest:bound.key,portals:normalize(input.portals,bound.bounds)};
  const bytes=new TextEncoder().encode(JSON.stringify(value));if(bytes.length>MAX)throw Error('Graph size limit');
  return {bytes,entry:{schema:1,source:value.source,manifest:bound.key,bytes:bytes.length,sha256:await hash(bytes)}};
 }
 return {encode,async decode(bytes,entry,manifest){
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>MAX||entry?.schema!==1||entry.bytes!==bytes.length||!hex(entry.sha256))throw Error('Graph digest mismatch');
  const owned=new Uint8Array(bytes),saved=structuredClone(entry),input=structuredClone(manifest);
  if(await hash(owned)!==saved.sha256)throw Error('Graph digest mismatch');
  const bound=await binding(input);if(saved.source!==input.source||saved.manifest!==bound.key)throw Error('Graph binding mismatch');
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(owned));
  if(value?.schema!==1||value.source!==input.source||value.manifest!==bound.key)throw Error('Graph binding mismatch');
  const normalized=await encode(input,value.portals);if(normalized.entry.sha256!==saved.sha256)throw Error('Noncanonical graph');
  return JSON.parse(new TextDecoder().decode(normalized.bytes));
 }};
}};
