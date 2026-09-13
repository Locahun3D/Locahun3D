// Candidate only. loadCollision must verify region identity/digest and bound decoding.
(() => {
  globalThis.LocahunNavigationJourney={create(io){
    let generation=0,pending=null,active=null;
    const cancel=()=>{
      generation++;pending?.abort();pending=null;io.regions.cancel();active?.dispose();active=null;
    };
    return {cancel,async acquire(from,to){
      cancel();const ticket=generation,state=io.read(),controller=new AbortController();pending=controller;
      const current=()=>{const now=io.read();return !controller.signal.aborted&&ticket===generation&&state&&now?.source===state.source&&now?.epoch===state.epoch;};
      let core=null,corridor=null;
      try{
        const prepare=async route=>{
        if(core){core.dispose();core=null;}corridor=null;
        if(!current())return false;
        let boxes;
        if(route.keys){
          if(!Array.isArray(route.keys)||route.keys.length<2||route.keys.length>4||
            route.keys.some(key=>typeof key!=='string'||!key)||new Set(route.keys).size!==route.keys.length||
            typeof io.verifyCore!=='function')return null;
          const unique=new Map();
          for(const key of route.keys){
            const part=await io.loadCollision(key,controller.signal);if(!current()||!Array.isArray(part)||part.length>100000)return null;
            for(const box of part){unique.set(JSON.stringify([box.center,box.half]),box);if(unique.size>100000)return null;}
          }
          boxes=[...unique.values()];
        }else boxes=await io.loadCollision(route.key,controller.signal);
        if(!current())return null;
        corridor=LocahunNavigationCorridor.create(route.points,boxes);if(!corridor)return null;
        core=await io.build(corridor.boxes);if(!current())return null;
        if(!core||typeof core.dispose!=='function')return null;
        if(route.keys&&((await io.verifyCore(route.points,core))!==true||!current()))return null;
        return true;
        };
        const route=await io.regions.find(from,to,prepare);if(!route||!current())return null;
        if(!core&&await prepare(route)!==true)return null;
        let disposed=false;const owned=core;core=null;
        const lease={key:route.key,points:route.points.map(p=>({...p})),core:owned,
          valid:()=>!disposed&&current(),covers:p=>!disposed&&current()&&corridor.covers(p),
          dispose(){if(disposed)return;disposed=true;try{owned.dispose();}finally{if(active===lease)active=null;}}};
        active=lease;return lease;
      }catch(_){return null;}
      finally{if(pending===controller)pending=null;if(core)core.dispose();}
    }};
  }};
})();
