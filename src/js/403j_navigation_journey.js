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
      let core=null;
      try{
        const route=await io.regions.find(from,to);if(!route||!current())return null;
        const boxes=await io.loadCollision(route.key,controller.signal);if(!current())return null;
        const corridor=LocahunNavigationCorridor.create(route.points,boxes);if(!corridor)return null;
        core=await io.build(corridor.boxes);if(!current())return null;
        if(!core||typeof core.dispose!=='function')return null;
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
