// Candidate geometry identity. Reads supplied digests only; never fetches source assets.
(() => {
  globalThis.LocahunNavigationSource={async key(sources){
    if(!Array.isArray(sources)||!sources.length||sources.length>1000)throw Error('Invalid navigation sources');
    const records=sources.map(s=>{
      if(!s||typeof s.sha256!=='string'||!/^[a-f0-9]{64}$/.test(s.sha256)||!Array.isArray(s.matrix)||s.matrix.length!==16||
        s.matrix.some(n=>!Number.isFinite(n)||Math.abs(n)>10000)||s.matrix[3]!==0||s.matrix[7]!==0||s.matrix[11]!==0||s.matrix[15]!==1)throw Error('Invalid navigation source transform');
      return JSON.stringify([s.sha256,s.matrix]);
    }).sort();
    const bytes=new TextEncoder().encode(JSON.stringify(['navigation-source-v1',records.map(r=>JSON.parse(r))]));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  }};
})();
