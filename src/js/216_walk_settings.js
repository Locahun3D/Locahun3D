globalThis.LocahunWalkSettings = {
  parseNavigationRegions(value) {
    const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
    if(!value||value.schema!==1||!hex(value.source)||!Array.isArray(value.regions)||!value.regions.length||value.regions.length>1024)return null;
    const seen=new Set(),regions=[];
    for(const pair of value.regions){
      const entries=[];
      for(const entry of [pair?.navigation,pair?.collision]){
        const b=entry?.bounds;
        if(!entry||entry.source!==value.source||!hex(entry.key)||!hex(entry.sha256)||!Number.isInteger(entry.bytes)||entry.bytes<1||entry.bytes>2000000||
          !Array.isArray(b)||b.length!==2||b.some(a=>!Array.isArray(a)||a.length!==3||a.some(n=>!Number.isFinite(n)||Math.abs(n)>10000))||
          b[1].some((n,i)=>n<=b[0][i])||b[1][0]-b[0][0]>32||b[1][2]-b[0][2]>32)return null;
        entries.push({source:entry.source,key:entry.key,bounds:b.map(a=>[...a]),bytes:entry.bytes,sha256:entry.sha256});
      }
      const [navigation,collision]=entries;
      if(navigation.key!==collision.key||JSON.stringify(navigation.bounds)!==JSON.stringify(collision.bounds)||seen.has(navigation.key))return null;
      seen.add(navigation.key);regions.push({navigation,collision});
    }
    return {schema:1,source:value.source,regions};
  },
  parse(value) {
    const v = value && typeof value === 'object' ? value : {};
    const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100000;
    const triple = a => Array.isArray(a) && a.length === 3 && a.every(finite);
    const boxes = v.boxes || [];
    if (!Array.isArray(boxes) || boxes.length > 30000) throw new Error('Collision proxy limit exceeded');
    for (const b of boxes) {
      if (!b || !triple(b.center) || !triple(b.half) || b.half.some(n => n <= 0 || n > 1000))
        throw new Error('Invalid collision proxy');
    }
    const navigationRegions=globalThis.LocahunWalkSettings.parseNavigationRegions(v.navigationRegions);
    return {
      version: 1,
      ...(navigationRegions?{navigationRegions}:{}),
      navigation: v.navigation && typeof v.navigation.key==='string' && /^[a-f0-9]{64}$/.test(v.navigation.key) &&
        v.navigation.key===v.whole?.key && typeof v.navigation.data==='string' && v.navigation.data.length>0 &&
        v.navigation.data.length<=2700000 && /^[A-Za-z0-9+/]*={0,2}$/.test(v.navigation.data)
        ? {key:v.navigation.key,data:v.navigation.data} : null,
      whole: v.whole && typeof v.whole.key==='string' && /^[a-f0-9]{64}$/.test(v.whole.key) &&
        typeof v.whole.data==='string' && v.whole.data.length>0 && v.whole.data.length<=22000000 && /^[A-Za-z0-9+/]*={0,2}$/.test(v.whole.data)
        ? {key:v.whole.key,data:v.whole.data} : null,
      meshOnly: v.meshOnly === true,
      cellSize: finite(v.cellSize) && v.cellSize >= .1 && v.cellSize <= 1 ? v.cellSize : .25,
      radius: finite(v.radius) && v.radius>=2 && v.radius<=50 ? v.radius : 12,
      effectiveCellSize: finite(v.effectiveCellSize) && v.effectiveCellSize>=.1 && v.effectiveCellSize<=1 ? v.effectiveCellSize : null,
      detailRegion: v.detailRegion && v.detailRegion.center && ['x','y','z'].every(k=>finite(v.detailRegion.center[k])) && v.detailRegion.radius===2
        ? {center:{x:v.detailRegion.center.x,y:v.detailRegion.center.y,z:v.detailRegion.center.z},radius:2,halfHeight:v.detailRegion.halfHeight===3?3:2} : null,
      spawnYaw: finite(v.spawnYaw) ? v.spawnYaw : null,
      region: v.region && v.region.center && ['x','y','z'].every(k=>finite(v.region.center[k])) &&
        finite(v.region.radius) && v.region.radius>=2 && v.region.radius<=50
        ? {center:{x:v.region.center.x,y:v.region.center.y,z:v.region.center.z},radius:v.region.radius} : null,
      meshIds: [...new Set((Array.isArray(v.meshIds) ? v.meshIds : []).filter(Number.isSafeInteger))],
      excludeIds: [...new Set((Array.isArray(v.excludeIds) ? v.excludeIds : []).filter(Number.isSafeInteger))],
      boxes: boxes.map(b => ({center: [...b.center], half: [...b.half]})),
      signature: typeof v.signature === 'string' && v.signature.length < 200000 ? v.signature : '',
      spawn: v.spawn && ['x','y','z'].every(k => finite(v.spawn[k]))
        ? {x:v.spawn.x,y:v.spawn.y,z:v.spawn.z} : null,
    };
  }
};
