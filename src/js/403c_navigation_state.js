(() => {
  const same=(a,b)=>a&&b&&a.key===b.key&&a.data===b.data&&a.epoch===b.epoch&&a.signature===b.signature;
  globalThis.LocahunNavigationState={create(io){
    let snapshot=null,query=null,pending=null,version=0,failed=false;
    function clear(){version++;query?.dispose();query=null;pending=null;snapshot=null;failed=false;}
    function current(){const value=io.read();if(!same(value,snapshot)){clear();snapshot=value?{...value}:null;}return snapshot;}
    return {
      clear,
      get(){return current()?query:null;},
      prepare(){
        const value=current();if(!value||failed)return Promise.resolve(null);
        if(query)return Promise.resolve(query);if(pending)return pending;
        const ticket=version;
        let decoded;try{decoded=io.decode(value);}catch(error){decoded=Promise.reject(error);}
        pending=Promise.resolve(decoded).then(mesh=>{
          if(ticket!==version||!same(value,io.read()))return null;
          const built=io.build(mesh);
          if(ticket!==version||!same(value,io.read())){built.dispose();return null;}
          query=built;return query;
        }).catch(()=>{if(ticket===version)failed=true;return null;}).finally(()=>{if(ticket===version)pending=null;});
        return pending;
      }
    };
  }};
})();
