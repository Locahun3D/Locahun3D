import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const hooks=`
window.__walkTest={
 get state(){return {active:walkMode.active,feet:walkMode.avatar?{x:walkMode.avatar.position.x,y:walkMode.groundY,z:walkMode.avatar.position.z}:null,airborne:walkMode.airborne,status:walkSetup.status,boxes:walkSetup.settings.boxes.length,source:walkMode.animSource,walkWeight:walkMode.walkAction?.getEffectiveWeight(),layers:layers.map(L=>({id:L.id,type:L.type,cache:L._splatCacheCount}))}},
 loadScan:async(full=false)=>{const b=await(await fetch(full?'/scan-full.splat':'/scan.splat')).blob();await loadSplatFile(new File([b],'real-scan.splat'));if(splatMesh)await splatMesh.initialized;},
 fixture:async()=>{loadEmptyProject();for(const [name,pos,size] of [['floor',[0,-.1,0],[10,.2,10]],['wall',[0,1.5,2],[6,3,.2]]]){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color:name==='floor'?0x6e7779:0x738f83}));m.position.set(...pos);const L=addLayer({type:'cube',name,mesh:m,size:{x:size[0],y:size[1],z:size[2]}});walkSetup.settings.meshIds.push(L.id);}camPos.set(0,1.6,-3);setCamRotImmediate(0,-.12);return await _walkGenerateCollision();},
 setView:(x,y,z,a=0,p=-.12)=>{camPos.set(x,y,z);setCamRotImmediate(a,p);markDirty(3);},
 generate:()=>_walkGenerateCollision(),
 save:()=>_walkSaveSettings(),
 restore:x=>_walkRestoreSettings(x),
 restoreProject:x=>restoreProject(x),
 zipRoundtrip:async()=>{const blob=await saveProjectZip(false,{returnBlob:true});if(!blob)throw new Error('ZIP missing');await _loadProjectZipFromFile(new File([blob],'walk-fixture.zip'));return {bytes:blob.size,walk:_walkSaveSettings()};},
 exclusions:()=>{selectedLayerId=layers.find(L=>L.name==='wall').id;walkExcludeSelected();const result=_walkExcludeBoxes([{center:[0,1,2],half:[.1,.1,.1]},{center:[0,1,4],half:[.1,.1,.1]}]);walkUseSelectedMesh();return result;},
 obstacle:(low=false)=>{const av=walkMode.avatar;let best=null;for(let i=0;i<256;i++){const a=i*Math.PI/128,d={x:Math.sin(a),y:0,z:Math.cos(a)},p={x:av.position.x,y:walkMode.groundY+(low?.45:1),z:av.position.z};const hit=walkSetup.core.raycast(p,d,9);p.y+=.35;const high=walkSetup.core.raycast(p,d,9);if(hit!==null&&high!==null&&hit>.8&&Math.abs(hit-high)<.6&&(!best||hit<best.distance))best={yaw:a,distance:hit,speed:walkMode.speed};}if(best)setCamRotImmediate(best.yaw,-.3);return best;},
 key:(name,value)=>{keys[name]=value;markDirty(5)},
 exit:()=>_avatarWalkExit(),
 get boxes(){return walkSetup.settings.boxes},
 get camera(){return {x:camPos.x,y:camPos.y,z:camPos.z,yaw,pitch}},
 transform:()=>{const L=layers.find(L=>L.type==='cube');L.mesh.position.x+=.25;},
};
`;
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/playback'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<title>歩行検証録画</title><body style="margin:0;background:#111"><video controls autoplay muted style="width:100%;height:100vh" src="/recording.webm"></video>');return;
 }
 if(url.pathname==='/recording.webm'){
   const dir=String.raw`F:\Codex\locahun-walk\verification`;
   const videos=fs.readdirSync(dir).filter(n=>n.endsWith('.webm')).map(n=>({file:path.join(dir,n),mtime:fs.statSync(path.join(dir,n)).mtimeMs})).sort((a,b)=>b.mtime-a.mtime);
   if(!videos.length){res.writeHead(404).end();return;}
   const file=videos[0].file,size=fs.statSync(file).size;
   const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
   if(range){const start=+range[1],end=range[2]?Math.min(+range[2],size-1):size-1;if(start>end){res.writeHead(416).end();return;}res.writeHead(206,{'Content-Type':'video/webm','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1,'Accept-Ranges':'bytes'});fs.createReadStream(file,{start,end}).pipe(res);}
   else{res.writeHead(200,{'Content-Type':'video/webm','Content-Length':size,'Accept-Ranges':'bytes'});fs.createReadStream(file).pipe(res);}return;
 }
 if(url.pathname==='/scan.splat'||url.pathname==='/scan-full.splat'){
   const file=url.pathname==='/scan-full.splat'?String.raw`F:\UNDEFINED Dropbox\UNDEFINED\Works\MFF\01_ProjectFile\3DGS\3DGS\locahun3d_Demo_point_cloud.splat`:String.raw`F:\Codex\locahun-walk\fixtures\real-scan.splat`;
   if(!fs.existsSync(file)){res.writeHead(404).end();return;}
   res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':fs.statSync(file).size});fs.createReadStream(file).pipe(res);return;
 }
 if(!['/','/test'].includes(url.pathname)){res.writeHead(404).end();return;}
 let html=fs.readFileSync(path.join(root,'Locahun3D_OfflineViewer.html'),'utf8');
 if(url.pathname==='/test'){const at=html.lastIndexOf('</script>');html=html.slice(0,at)+hooks+html.slice(at);}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(html);
}).listen(8193,'127.0.0.1',()=>console.log('Walk preview http://127.0.0.1:8193/'));
