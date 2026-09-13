function _disposeKawaiiScene(model){
  const geometries=new Set(),materials=new Set(),skeletons=new Set();
  model.traverse(o=>{
    if(o.geometry)geometries.add(o.geometry);
    if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));
    if(o.skeleton)skeletons.add(o.skeleton);
  });
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());skeletons.forEach(s=>s.dispose());
}

// Same bone names are not the same bind frames. Transfer evaluated world
// rotations through per-joint calibration, keeping target offsets/inverse binds.
function _retargetKawaiiLocomotion(source,target,clips,options={}){
  source.updateMatrixWorld(true);target.updateMatrixWorld(true);
  const sources=new Map(),targets=[],calibration=new Map(),rest=new Map();
  source.traverse(b=>{if(b.isBone)sources.set(b.name,b);});
  target.traverse(b=>{if(b.isBone){targets.push(b);rest.set(b,{q:b.quaternion.clone(),p:b.position.clone()});}});
  const tips={};
  for(const side of ['Left','Right'])for(const [a,b] of [['Arm','ForeArm'],['ForeArm','Hand'],['UpLeg','Leg'],['Leg','Foot']])tips[side+a]=side+b;
  if(options.alignHands){
    for(const side of ['Left','Right']){
      tips[side+'Hand']=side+'HandMiddle1';
      for(const finger of ['Thumb','Index','Middle','Ring','Pinky'])for(let i=1;i<=3;i++){
        const name=side+'Hand'+finger;
        if(target.getObjectByName(name+(i+1))&&sources.has(name+(i+1)))tips[name+i]=name+(i+1);
      }
    }
  }
  const p=new THREE.Vector3(),v=new THREE.Vector3(),q=new THREE.Quaternion(),parentQ=new THREE.Quaternion();
  for(const bone of targets){
    const src=sources.get(bone.name);if(!src)throw new Error('Motion source bone missing: '+bone.name);
    const sq=src.getWorldQuaternion(new THREE.Quaternion()),tq=bone.getWorldQuaternion(new THREE.Quaternion());
    const tip=tips[bone.name];
    if(tip){
      const sTip=sources.get(tip),tTip=target.getObjectByName(tip);
      const sd=sTip.getWorldPosition(new THREE.Vector3()).sub(src.getWorldPosition(p)).normalize();
      const td=tTip.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(p)).normalize();
      tq.premultiply(new THREE.Quaternion().setFromUnitVectors(td,sd));
    }
    calibration.set(bone.name,sq.invert().multiply(tq));
  }
  function legLength(scene){
    let length=0;
    for(const side of ['Left','Right'])for(const [a,b] of [['UpLeg','Leg'],['Leg','Foot']]){
      scene.getObjectByName(side+a).getWorldPosition(p);scene.getObjectByName(side+b).getWorldPosition(v);
      length+=p.distanceTo(v);
    }
    return length;
  }
  const scale=legLength(target)/legLength(source),sourceHips=sources.get('Hips'),hips=target.getObjectByName('Hips');
  if(!Number.isFinite(scale)||scale<=0||!sourceHips||!hips)throw new Error('Invalid retarget skeleton');
  const sourceHipRest=sourceHips.position.clone(),mixer=new THREE.AnimationMixer(source),result=[];
  try{
    for(const clip of clips){
      if(!clip)throw new Error('Motion clip missing for retarget');
      const action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;
      action.reset().setEffectiveWeight(1).play();
      const frames=Math.ceil(clip.duration*120),times=[],positions=[],values=new Map(targets.map(b=>[b,[]]));
      for(let i=0;i<=frames;i++){
        const time=i/frames*clip.duration;mixer.setTime(time);source.updateMatrixWorld(true);
        const delta=sourceHips.parent.localToWorld(sourceHips.position.clone())
          .sub(sourceHips.parent.localToWorld(sourceHipRest.clone())).multiplyScalar(scale);
        const zero=hips.parent.worldToLocal(new THREE.Vector3());
        hips.position.copy(rest.get(hips).p).add(hips.parent.worldToLocal(delta).sub(zero));
        target.updateMatrixWorld(true);
        for(const bone of targets){
          sources.get(bone.name).getWorldQuaternion(q).multiply(calibration.get(bone.name));
          bone.parent.getWorldQuaternion(parentQ).invert();
          bone.quaternion.copy(parentQ.multiply(q)).normalize();bone.updateMatrixWorld(true);
          values.get(bone).push(...bone.quaternion.toArray());
        }
        times.push(time);positions.push(...hips.position.toArray());
      }
      const tracks=targets.map(b=>new THREE.QuaternionKeyframeTrack(b.name+'.quaternion',times,values.get(b)));
      tracks.push(new THREE.VectorKeyframeTrack('Hips.position',times,positions));
      result.push(new THREE.AnimationClip(clip.name,clip.duration,tracks));
      mixer.stopAllAction();
    }
  }finally{
    mixer.stopAllAction();mixer.uncacheRoot(source);
    rest.forEach((r,b)=>{b.quaternion.copy(r.q);b.position.copy(r.p);});target.updateMatrixWorld(true);
  }
  return {clips:result,legScale:scale};
}

// A separate authored run, not time-compressed walking or claimed mocap.
// Sample on the loaded rig: world-space bends avoid assumptions about bone axes.
function _makeKawaiiRunClip(model){
  const names=['Spine2','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg',
    'LeftFoot','RightFoot','LeftArm','RightArm','LeftForeArm','RightForeArm'];
  const bones=names.map(n=>model.getObjectByName(n)).filter(Boolean);
  const hips=model.getObjectByName('Hips');
  if(!hips)throw new Error('Run animation requires Hips');
  const rest=new Map(bones.map(b=>[b,b.quaternion.clone()])),hipRest=hips.position.clone();
  const times=[],values=new Map(bones.map(b=>[b,[]])),positions=[];
  const q=new THREE.Quaternion(),axis=new THREE.Vector3(),inv=new THREE.Quaternion();
  const bounds=new THREE.Box3().setFromObject(model,true),floor=bounds.min.y,height=bounds.max.y-floor;
  const offset=new THREE.Vector3(),origin=new THREE.Vector3();
  const footPaths={Left:[],Right:[]},sampleCount=100,contactEnd=22;
  function curve(t,points){
    for(let i=1;i<points.length;i++)if(t<=points[i][0]){
      const a=points[i-1],b=points[i],u=(t-a[0])/(b[0]-a[0]);
      return a[1]+(b[1]-a[1])*u*u*(3-2*u);
    }
    return points.at(-1)[1];
  }
  function bend(name,angle,worldAxis=[1,0,0]){
    const b=model.getObjectByName(name);if(!b)return;
    b.parent.getWorldQuaternion(inv).invert();axis.fromArray(worldAxis).applyQuaternion(inv);
    b.quaternion.premultiply(q.setFromAxisAngle(axis,angle));b.updateMatrixWorld(true);
  }
  for(let i=0;i<=sampleCount;i++){
    const t=i/sampleCount;
    rest.forEach((q,b)=>b.quaternion.copy(q));hips.position.copy(hipRest);model.updateMatrixWorld(true);
    bend('Spine2',.12);
    bend('Spine2',.08*Math.sin(t*2*Math.PI),[0,1,0]);
    const chestUp=model.getObjectByName('Neck').getWorldPosition(new THREE.Vector3())
      .sub(model.getObjectByName('Spine').getWorldPosition(new THREE.Vector3())).normalize();
    const chestRight=model.getObjectByName('LeftShoulder').getWorldPosition(new THREE.Vector3())
      .sub(model.getObjectByName('RightShoulder').getWorldPosition(new THREE.Vector3())).normalize();
    const chestForward=new THREE.Vector3().crossVectors(chestRight,chestUp).normalize();
    chestRight.crossVectors(chestUp,chestForward).normalize();
    for(const [side,shift] of [['Left',0],['Right',.5]]){
      const p=(t+shift)%1;
      const hip=p<=.22?-.62+1.04*p/.22:curve(p,[[.22,.42],[.48,.25],[.76,-.85],[1,-.62]]);
      const knee=curve(p,[[0,.22],[.12,.28],[.22,.35],[.48,1.65],[.76,1.45],[1,.22]]);
      bend(side+'UpLeg',hip);bend(side+'Leg',knee);
      bend(side+'Foot',-hip-knee+curve(p,[[0,0],[.22,0],[.48,.65],[.76,.1],[1,0]]));
      // Include the idle baseline in the35deg chest-relative extension limit.
      // A quadratic phase mapping keeps velocity continuous at the mid-swing.
      const direction=model.getObjectByName(side+'ForeArm').getWorldPosition(new THREE.Vector3())
        .sub(model.getObjectByName(side+'Arm').getWorldPosition(new THREE.Vector3())).normalize();
      const baseline=Math.atan2(-direction.dot(chestForward),-direction.dot(chestUp));
      const back=Math.max(0,35*Math.PI/180-baseline),forward=.80,s=-Math.sin(p*2*Math.PI);
      const swing=(back+forward)*.5*s+(back-forward)*.5*s*s;
      bend(side+'Arm',swing,chestRight.toArray());bend(side+'ForeArm',-1.2);
    }
    model.updateMatrixWorld(true);
    // Contact occupies 22% of each leg cycle, separated by suspension.
    const half=t%.5,flight=half>.22?Math.sin((half-.22)/.28*Math.PI)*height*.035:0;
    const minY=new THREE.Box3().setFromObject(model,true).min.y;
    origin.set(0,0,0);offset.set(0,floor+flight-minY,0);
    hips.parent.worldToLocal(origin);hips.parent.worldToLocal(offset);
    hips.position.add(offset.sub(origin));model.updateMatrixWorld(true);
    for(const side of ['Left','Right']){
      const foot=model.getObjectByName(side+'Foot');
      if(!foot)throw new Error('Run animation requires both feet');
      footPaths[side].push(foot.getWorldPosition(new THREE.Vector3()));
    }
    times.push(t*.64);positions.push(...hips.position.toArray());
    for(const b of bones)values.get(b).push(...b.quaternion.toArray());
  }
  // Cancel the nonlinear stance arc inside the clip, not by moving the
  // collision root. Both feet share one calibrated travel speed. During
  // suspension, smoothly return the small pelvis correction for the next foot.
  const travel=((footPaths.Left[0].z-footPaths.Left[contactEnd].z)+
    (footPaths.Right[50].z-footPaths.Right[50+contactEnd].z))*.5;
  const corrections=[];
  for(let i=0;i<=sampleCount;i++){
    const start=i<50?0:50,side=start===0?'Left':'Right',phase=i-start;
    const first=footPaths[side][start],end=footPaths[side][start+contactEnd];
    let correction;
    if(i===sampleCount)correction=0;
    else if(phase<=contactEnd)correction=first.z-travel*phase/contactEnd-footPaths[side][i].z;
    else{
      const u=(phase-contactEnd)/(50-contactEnd);
      correction=(first.z-travel-end.z)*(1-u*u*(3-2*u));
    }
    corrections.push(correction);
    origin.set(0,0,0);offset.set(0,0,correction);
    hips.parent.worldToLocal(origin);hips.parent.worldToLocal(offset);offset.sub(origin);
    positions[i*3]+=offset.x;positions[i*3+1]+=offset.y;positions[i*3+2]+=offset.z;
  }
  rest.forEach((q,b)=>b.quaternion.copy(q));hips.position.copy(hipRest);model.updateMatrixWorld(true);
  const tracks=bones.map(b=>new THREE.QuaternionKeyframeTrack(b.name+'.quaternion',times,values.get(b)));
  tracks.push(new THREE.VectorKeyframeTrack(hips.name+'.position',times,positions));
  const clip=new THREE.AnimationClip('Run_Authored_B1',.64,tracks);
  clip.userData={nominal_speed_mps:travel/(.64*.22),contactEnd:.22,
    maxPelvisCorrection:Math.max(...corrections.map(Math.abs))};
  return clip;
}

function _kawaiiEmbeddedLocomotion(gltf,legacySource=false){
  const names=['Idle','Walk','Run','Jump','Land','Stop'];
  const found=names.map(name=>gltf.animations.filter(c=>c.name===name+'_Locomotion'));
  // Older source assets may contain only an optional calibrated run action.
  if(!found.some((list,i)=>list.length&&(!legacySource||i!==2)))return null;
  if(found.some(list=>list.length>1))throw new Error('Duplicate locomotion clip');
  if(found.some(list=>list.length!==1||!list[0].tracks.length||!Number.isFinite(list[0].duration)||list[0].duration<=0)){
    throw new Error('Incomplete locomotion clips: require Idle/Walk/Run/Jump/Land/Stop_Locomotion');
  }
  const meta=gltf.scene.getObjectByName('B1_Rig')?.userData;
  for(const gait of ['walk','run'])if(!Number.isFinite(meta?.['nominal_'+gait+'_speed_mps'])||meta['nominal_'+gait+'_speed_mps']<=0){
    throw new Error('Kawaii '+gait+' speed metadata missing');
  }
  return Object.fromEntries(names.map((name,i)=>[name.toLowerCase(),found[i][0]]));
}

const _kawaiiAvatarDataRequests = new Map();
async function _resolveKawaiiAvatarData(options = {}){
  if(options.modelData)return await options.modelData;
  if(window.KAWAII_MALE_GLB_B64)return _b64ToArrayBuffer(window.KAWAII_MALE_GLB_B64);
  const info=window.KAWAII_MALE_ASSET_INFO;
  if(info?.delivery!=='lazy-glb')return null;
  const {url:assetUrl,bytes:expectedBytes,sha256}=info;
  if(typeof assetUrl!=='string'||!assetUrl||!Number.isSafeInteger(expectedBytes)||expectedBytes<12||expectedBytes>16000000||!/^[a-f0-9]{64}$/.test(sha256))throw new Error('Invalid avatar asset manifest');
  const location=window.location;
  if(!location||!/^https?:$/.test(location.protocol))throw new Error('HTTP avatar manifest requires HTTP(S); use the embedded viewer for offline files');
  const url=new URL(assetUrl,location.href);
  if(!/^https?:$/.test(url.protocol)||url.origin!==location.origin||url.username||url.password)throw new Error('Avatar asset must use the same HTTP origin');
  if(typeof crypto==='undefined'||!crypto.subtle?.digest)throw new Error('Avatar SHA-256 verification requires HTTPS or localhost');
  const key=url.href+'|'+expectedBytes+'|'+sha256;
  if(_kawaiiAvatarDataRequests.has(key))return _kawaiiAvatarDataRequests.get(key);
  // Share immutable bytes, never a parsed scene or a caller's cancellable build.
  const request=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    try{
      const response=await fetch(url.href,{credentials:'same-origin',redirect:'error',signal:controller.signal});
      if(!response.ok)throw new Error('Avatar asset HTTP '+response.status);
      let data;
      if(response.body?.getReader){
        const reader=response.body.getReader(),buffer=new Uint8Array(expectedBytes);let size=0;
        try{
          while(true){const {done,value}=await reader.read();if(done)break;
            if(size+value.byteLength>expectedBytes)throw new Error('Avatar asset size mismatch');
            buffer.set(value,size);size+=value.byteLength;
          }
          if(size!==expectedBytes)throw new Error('Avatar asset size mismatch');
          data=buffer.buffer;
        }catch(error){await reader.cancel().catch(()=>{});throw error;}
        finally{reader.releaseLock();}
      }else data=await response.arrayBuffer();
      if(data.byteLength!==expectedBytes)throw new Error('Avatar asset size mismatch');
      const header=new DataView(data);
      if(header.getUint32(0,true)!==0x46546c67||header.getUint32(4,true)!==2||header.getUint32(8,true)!==data.byteLength)throw new Error('Avatar asset is not a valid GLB2 payload');
      const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join('');
      if(digest!==sha256)throw new Error('Avatar asset SHA-256 mismatch');
      return data;
    }catch(error){throw new Error(controller.signal.aborted?'Avatar asset download timeout':'Avatar asset download failed: '+error.message);}
    finally{clearTimeout(timer);}
  })().catch(error=>{if(_kawaiiAvatarDataRequests.get(key)===request)_kawaiiAvatarDataRequests.delete(key);throw error;});
  _kawaiiAvatarDataRequests.set(key,request);
  return request;
}

// Viewer-only native-derived avatar; not a motion sales asset.
// The caller owns placement, facing, collision, and cancellation of async builds.
async function _buildKawaiiWalkAvatar(height = 1.65, options = {}){
  if(!Number.isFinite(height) || height <= 0) throw new Error('Invalid avatar height');
  const Cls = await _addonLoader('GLTFLoader');
  if(!Cls) throw new Error('GLTFLoader unavailable');
  const targetData=await _resolveKawaiiAvatarData(options);
  const parse=data=>new Promise((resolve,reject)=>new Cls().parse(data,'',resolve,reject));
  let gltf,embeddedClips;
  try{
    if(!targetData&&!window.KAWAII_WALK_GLB_B64)throw new Error('Embedded kawaii avatar missing');
    gltf=await parse(targetData||_b64ToArrayBuffer(window.KAWAII_WALK_GLB_B64));
    embeddedClips=_kawaiiEmbeddedLocomotion(gltf,!targetData);
    if(targetData&&!embeddedClips){
      if(!window.KAWAII_WALK_GLB_B64)throw new Error('Embedded kawaii avatar missing');
      const source=await parse(_b64ToArrayBuffer(window.KAWAII_WALK_GLB_B64));
      try{
        const names=['Idle_Procedural','Walk_CMU_07_01'];
        const transferred=_retargetKawaiiLocomotion(source.scene,gltf.scene,names.map(n=>THREE.AnimationClip.findByName(source.animations,n)));
        gltf.animations=transferred.clips;
        const rig=gltf.scene.getObjectByName('B1_Rig');
        if(!rig)throw new Error('Target B1_Rig missing');
        rig.userData.nominal_speed_mps=source.scene.getObjectByName('B1_Rig')?.userData.nominal_speed_mps*transferred.legScale;
      }finally{_disposeKawaiiScene(source.scene);}
    }
  }catch(error){if(gltf)_disposeKawaiiScene(gltf.scene);throw error;}
  const root = new THREE.Group();
  root.name = 'KawaiiWalkAvatar';
  root.userData.__avatar = true;
  const model = gltf.scene;
  root.add(model);
  // Measure the exported rest pose, never an idle crouch or head inclination.
  const restBounds=embeddedClips?new THREE.Box3().setFromObject(model,true):null;
  const mixer = new THREE.AnimationMixer(model);
  const clips = embeddedClips?[embeddedClips.idle,embeddedClips.walk]:['Idle_Procedural', 'Walk_CMU_07_01'].map(name =>
    THREE.AnimationClip.findByName(gltf.animations, name));
  const disposeModel = () => _disposeKawaiiScene(model);
  if(clips.some(c => !c || !c.tracks.length)){
    disposeModel();
    throw new Error('Kawaii idle/walk clips missing');
  }
  const [idleAction, walkAction] = clips.map(c => mixer.clipAction(c));
  idleAction.setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).play();
  walkAction.setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(0).play();
  mixer.update(0);
  const embeddedRun=THREE.AnimationClip.findByName(gltf.animations,'Run_Locomotion');
  let runClip;
  try{runClip=embeddedRun||_makeKawaiiRunClip(model);}
  catch(error){mixer.stopAllAction();mixer.uncacheRoot(model);disposeModel();throw error;}
  const runAction=mixer.clipAction(runClip).setLoop(THREE.LoopRepeat,Infinity).setEffectiveWeight(0).play();
  model.updateMatrixWorld(true);
  // Precise bounds sample the posed skinned vertices, not the undeformed geometry.
  const bounds = restBounds||new THREE.Box3().setFromObject(model, true);
  const nativeHeight = bounds.max.y - bounds.min.y;
  if(!Number.isFinite(nativeHeight) || nativeHeight < 0.1){
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    disposeModel();
    throw new Error('Invalid kawaii avatar bounds');
  }
  const scale = height / nativeHeight;
  const sourceSpeed = model.getObjectByName('B1_Rig')?.userData[embeddedClips?'nominal_walk_speed_mps':'nominal_speed_mps'];
  if(!Number.isFinite(sourceSpeed) || sourceSpeed <= 0){
    mixer.stopAllAction();
    mixer.uncacheRoot(model);
    disposeModel();
    throw new Error('Kawaii walking speed metadata missing');
  }
  const runSpeed=embeddedRun?model.getObjectByName('B1_Rig')?.userData.nominal_run_speed_mps:runClip.userData.nominal_speed_mps;
  if(!Number.isFinite(runSpeed)||runSpeed<=0){
    mixer.stopAllAction();mixer.uncacheRoot(model);disposeModel();
    throw new Error('Kawaii run speed metadata missing');
  }
  model.scale.multiplyScalar(scale);
  model.position.x -= (bounds.min.x + bounds.max.x) * 0.5 * scale;
  model.position.y -= bounds.min.y * scale;
  model.position.z -= (bounds.min.z + bounds.max.z) * 0.5 * scale;
  model.traverse(o => {
    if(o.isMesh){
      o.castShadow = true;
      o.receiveShadow = true;
      // Bind-pose bounds can cull a moving skinned limb near the viewport edge.
      if(o.isSkinnedMesh) o.frustumCulled = false;
    }
  });
  // These are additive procedural poses on B1's actual rig, not extra mocap clips.
  const poseNames=['Spine2','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg',
    'LeftFoot','RightFoot','LeftArm','RightArm','LeftForeArm','RightForeArm'];
  const poseBones=poseNames.map(name=>model.getObjectByName(name)).filter(Boolean);
  const joints=new Map(poseBones.map(bone=>[bone.name,bone]));
  // Derive finger curl axes from the loaded palm, not assumed source bone axes.
  const relaxedHands=new Map();
  model.updateMatrixWorld(true);
  for(const side of embeddedClips?[]:['Left','Right']){
    const hand=model.getObjectByName(side+'Hand');
    const middle=model.getObjectByName(side+'HandMiddle1');
    const index=model.getObjectByName(side+'HandIndex1');
    const pinky=model.getObjectByName(side+'HandPinky1');
    if(!hand||!middle||!index||!pinky)continue;
    const wrist=hand.getWorldPosition(new THREE.Vector3());
    const forward=middle.getWorldPosition(new THREE.Vector3()).sub(wrist).normalize();
    const across=index.getWorldPosition(new THREE.Vector3()).sub(pinky.getWorldPosition(new THREE.Vector3())).normalize();
    const inward=new THREE.Vector3().crossVectors(forward,across).normalize();
    const toBody=model.getObjectByName('Hips').getWorldPosition(new THREE.Vector3()).sub(wrist);
    if(inward.dot(toBody)<0)inward.negate();
    for(const finger of ['Index','Middle','Ring','Pinky','Thumb'])for(let joint=1;joint<=3;joint++){
      const bone=model.getObjectByName(side+'Hand'+finger+joint);
      const tip=model.getObjectByName(side+'Hand'+finger+(joint+1));
      if(!bone||!tip)continue;
      const direction=tip.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
      const curlAxis=new THREE.Vector3().crossVectors(direction,inward).normalize();
      curlAxis.applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
      const angle=(finger==='Thumb'?[.14,.22,.16]:[.35,.50,.28])[joint-1];
      relaxedHands.set(bone,new THREE.Quaternion().setFromAxisAngle(curlAxis,angle));
      poseBones.push(bone);
    }
  }
  const basePose=new Map(),rightAxis=new THREE.Vector3(),parentQ=new THREE.Quaternion();
  const deltaQ=new THREE.Quaternion(),axis=new THREE.Vector3();
  const originalModelY=model.position.y;
  // The addon is optional: offline import failure must not prevent the avatar.
  let IKSolver=null;
  try{
    IKSolver=options.loadIKSolver ? await options.loadIKSolver() :
      (await import('three/addons/animation/CCDIKSolver.js')).CCDIKSolver;
  }catch(_){ /* Base mocap remains available without terrain correction. */ }
  const footIK=[];
  if(IKSolver)for(const side of ['Left','Right']){
    const thigh=joints.get(side+'UpLeg'),knee=joints.get(side+'Leg'),foot=joints.get(side+'Foot');
    if(!thigh||!knee||!foot||foot.parent!==knee||knee.parent!==thigh)continue;
    const vertices=[];
    model.traverse(mesh=>{
      if(!mesh.isSkinnedMesh)return;
      const indices=new Set();
      mesh.skeleton.bones.forEach((bone,i)=>{
        for(let b=bone;b;b=b.parent)if(b===foot){indices.add(i);break;}
      });
      const si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight;
      if(!si||!sw)return;
      for(let i=0;i<si.count;i++){
        let weight=0;
        for(let j=0;j<4;j++)if(indices.has(si.getComponent(i,j)))weight+=sw.getComponent(i,j);
        if(weight>=.5)vertices.push({mesh,index:i});
      }
    });
    if(!vertices.length)continue;
    // This private adapter never changes any SkinnedMesh skeleton or bind pose.
    const target=new THREE.Object3D();
    const chain={target:3,effector:2,links:[{index:1},{index:0}],iteration:16,maxAngle:.2};
    footIK.push({foot,target,vertices,chain,
      idlePoint:root.worldToLocal(foot.getWorldPosition(new THREE.Vector3())),
      idleRotation:foot.getWorldQuaternion(new THREE.Quaternion()),
      solver:new IKSolver({skeleton:{bones:[thigh,knee,foot,target]}},[chain])});
  }
  const soleBounds=new THREE.Box3(),solePoint=new THREE.Vector3(),rootPoint=new THREE.Vector3();
  const ankleQ=new THREE.Quaternion(),ankleParentQ=new THREE.Quaternion();
  function correctTerrain(groundAt){
    if(typeof groundAt!=='function'||!footIK.length)return;
    root.getWorldPosition(rootPoint);
    // A mocap toe can span two 18cm treads. Start above both, while keeping
    // this visual correction bounded independently of capsule step climbing.
    const maxRise=.40*height/1.65;
    for(const leg of footIK){
      leg.foot.getWorldQuaternion(ankleQ);
      for(let pass=0;pass<3;pass++){
        soleBounds.makeEmpty();
        for(const {mesh,index} of leg.vertices){
          mesh.getVertexPosition(index,solePoint).applyMatrix4(mesh.matrixWorld);
          soleBounds.expandByPoint(solePoint);
        }
        let surface=-Infinity;
        // A small footprint grid catches tread edges without raycasting every vertex.
        for(const x of [soleBounds.min.x,(soleBounds.min.x+soleBounds.max.x)/2,soleBounds.max.x]){
          for(const z of [soleBounds.min.z,(soleBounds.min.z+soleBounds.max.z)/2,soleBounds.max.z]){
            let hit;
            try{hit=groundAt({x,y:rootPoint.y,z},maxRise);}catch(_){continue;}
            const n=hit?.normal;
            if(!Number.isFinite(hit?.y)||!n||!Number.isFinite(n.x)||!Number.isFinite(n.y)||!Number.isFinite(n.z))continue;
            const length=Math.hypot(n.x,n.y,n.z);
            if(!length||n.y/length<.75||hit.y>rootPoint.y+maxRise||hit.y<rootPoint.y-.05)continue;
            surface=Math.max(surface,hit.y);
          }
        }
        // Anti-penetration on raised terrain, not a replacement for flat-ground mocap.
        if(surface<=rootPoint.y+.01||surface-soleBounds.min.y<=.001)break;
        leg.foot.getWorldPosition(leg.target.position);
        leg.target.position.y+=Math.min(maxRise,surface-soleBounds.min.y+.004);
        leg.target.updateMatrixWorld(true);
        leg.solver.updateOne(leg.chain);
        leg.foot.parent.getWorldQuaternion(ankleParentQ).invert();
        leg.foot.quaternion.copy(ankleParentQ.multiply(ankleQ));
        root.updateMatrixWorld(true);
      }
    }
  }
  let airWeight=0,landingTime=0,wasGrounded=true,lastRate=0,airTime=0;
  let launched=false,lastVertical=0,landingStrength=0,lastRunRate=1;
  let wasMoving=false,stopAnchor=null;
  function solveStoppedLeg(leg,point,rotation,weight){
    leg.foot.getWorldQuaternion(ankleQ);
    leg.target.position.copy(point);leg.target.updateMatrixWorld(true);
    const iterations=leg.chain.iteration;leg.chain.iteration=96;
    leg.solver.updateOne(leg.chain,weight);leg.chain.iteration=iterations;
    ankleQ.slerp(rotation,weight);
    leg.foot.parent.getWorldQuaternion(ankleParentQ).invert();
    leg.foot.quaternion.copy(ankleParentQ.multiply(ankleQ));
    root.updateMatrixWorld(true);
  }
  function holdStoppedFoot(dt,moving){
    if(!stopAnchor)return;
    const {leg,point,rotation,origin,heading}=stopAnchor;
    root.getWorldPosition(rootPoint);root.getWorldQuaternion(parentQ);
    if(rootPoint.distanceTo(origin)>.35||parentQ.angleTo(heading)>.45){stopAnchor=null;return;}
    if(moving)stopAnchor.weight*=Math.exp(-18*dt);
    if(stopAnchor.weight<.01){stopAnchor=null;return;}
    stopAnchor.time+=dt;
    if(stopAnchor.time>=.44){stopAnchor=null;return;}
    const u=Math.max(0,Math.min(1,(stopAnchor.time-.12)/.32)),ease=u*u*(3-2*u);
    const goal=root.localToWorld(leg.idlePoint.clone()),target=point.clone().lerp(goal,ease);
    target.y+=Math.sin(u*Math.PI)*.075*height/1.65;
    const goalQ=root.getWorldQuaternion(new THREE.Quaternion()).multiply(leg.idleRotation);
    const targetQ=rotation.clone().slerp(goalQ,ease);
    // The pelvis yields while the supporting foot stays behind the stopped
    // capsule; then the recovery step brings that foot under the body again.
    const hip=leg.foot.parent.parent.getWorldPosition(new THREE.Vector3());
    const knee=leg.foot.parent.getWorldPosition(new THREE.Vector3());
    const ankle=leg.foot.getWorldPosition(new THREE.Vector3());
    const reach=(hip.distanceTo(knee)+knee.distanceTo(ankle))*.985;
    const horizontal=Math.hypot(hip.x-target.x,hip.z-target.z);
    const verticalReach=Math.sqrt(Math.max(.01,reach*reach-horizontal*horizontal));
    const drop=Math.min(.14,Math.max(0,hip.y-target.y-verticalReach));
    model.position.y-=drop*stopAnchor.weight;root.updateMatrixWorld(true);
    solveStoppedLeg(leg,target,targetQ,stopAnchor.weight);
    for(const other of footIK){
      if(other===leg)continue;
      let sole=Infinity;
      for(const {mesh,index} of other.vertices){
        mesh.getVertexPosition(index,solePoint).applyMatrix4(mesh.matrixWorld);sole=Math.min(sole,solePoint.y);
      }
      if(sole<stopAnchor.floor){
        const p=other.foot.getWorldPosition(new THREE.Vector3());p.y+=stopAnchor.floor-sole+.002;
        const q=other.foot.getWorldQuaternion(new THREE.Quaternion());
        solveStoppedLeg(other,p,q,stopAnchor.weight);
      }
    }
  }
  function clearPose(){
    basePose.forEach((q,bone)=>bone.quaternion.copy(q));
    basePose.clear();model.position.y=originalModelY;
  }
  function bend(name,angle){
    const bone=joints.get(name);if(!bone||!angle)return;
    bone.parent.getWorldQuaternion(parentQ).invert();
    axis.copy(rightAxis).applyQuaternion(parentQ).normalize();
    bone.quaternion.premultiply(deltaQ.setFromAxisAngle(axis,angle));
    bone.updateMatrixWorld(true);
  }
  function applyPose(air,landing){
    poseBones.forEach(bone=>basePose.set(bone,bone.quaternion.clone()));
    relaxedHands.forEach((q,bone)=>bone.quaternion.multiply(q));
    root.updateMatrixWorld(true);
    rightAxis.set(1,0,0).applyQuaternion(root.getWorldQuaternion(parentQ));
    bend('Spine2',airWeight*.10+landing*.10);
    for(const side of ['Left','Right']){
      bend(side+'UpLeg',-airWeight*air*.45-landing*.20);
      bend(side+'Leg',airWeight*air*.90+landing*.40);
      bend(side+'Foot',-airWeight*air*.30-landing*.20);
      bend(side+'Arm',-airWeight*.55);
      bend(side+'ForeArm',-airWeight*.65);
    }
    model.position.y-=landing*.035*height/1.7;
    root.updateMatrixWorld(true);
  }
  const actions={idle:idleAction,walk:walkAction,run:runAction};
  const jumpTiming=model.getObjectByName('B1_Rig')?.userData.jump_timing;
  const jumpDuration=embeddedClips?.jump.duration;
  // Uniform time scaling is only appropriate for a verified full-flight clip.
  const syncJumpTiming=!!(embeddedClips&&jumpTiming?.source_ballistic_removed===true&&
    Number.isFinite(jumpTiming.duration_s)&&Math.abs(jumpTiming.duration_s-jumpDuration)<1e-4&&
    jumpTiming.takeoff_clip_s===0&&Number.isFinite(jumpTiming.prelanding_clip_s)&&
    Math.abs(jumpTiming.prelanding_clip_s-jumpDuration)<1e-4&&
    Number.isFinite(jumpTiming.apex_clip_s)&&Math.abs(jumpTiming.apex_clip_s/jumpDuration-.5)<=.02);
  if(embeddedClips)for(const name of ['jump','land','stop']){
    const action=mixer.clipAction(embeddedClips[name]);
    action.setLoop(THREE.LoopOnce,1).setEffectiveWeight(0).play();
    action.clampWhenFinished=true;
    actions[name]=action;
  }
  let clipState='idle';
  function selectClip(state,falling=false){
    if(state===clipState)return;
    clipState=state;
    if(['jump','land','stop'].includes(state)){
      actions[state].reset().setEffectiveTimeScale(1).play();
      if(falling){actions.jump.time=embeddedClips.jump.duration;actions.jump.paused=true;}
    }
  }
  function updateEmbedded(dt,speed,grounded,motion){
    const moving=grounded&&speed>.035;
    const running=moving&&speed>api.nominalSpeed*1.15&&
      (motion.running===true||speed>api.nominalSpeed*1.6);
    const vertical=Number.isFinite(motion.verticalSpeed)?motion.verticalSpeed:0;
    const gait=moving?(running?'run':'walk'):'idle';
    if(!grounded){
      if(wasGrounded){
        airTime=0;launched=vertical>1;selectClip('jump',!launched);
        const flight=motion.jumpFlightSeconds,rate=jumpDuration/flight;
        if(launched&&syncJumpTiming&&Number.isFinite(flight)&&flight>0&&Number.isFinite(rate)&&rate>0){
          actions.jump.setEffectiveTimeScale(rate);
        }
      }
      airTime+=dt;
    }else if(!wasGrounded)selectClip('land');
    else if(!moving&&clipState==='land'&&actions.land.time<embeddedClips.land.duration){
      // Hold recovery only while stationary; real movement can interrupt it.
    }else if(!moving&&wasMoving)selectClip('stop');
    else if(clipState!=='stop'||moving||actions.stop.time>=embeddedClips.stop.duration)selectClip(gait);
    wasGrounded=grounded;wasMoving=moving;
    const fade=1-Math.exp(-18*dt);
    for(const [name,action] of Object.entries(actions)){
      action.setEffectiveWeight(action.getEffectiveWeight()+((name===clipState?1:0)-action.getEffectiveWeight())*fade);
    }
    walkAction.setEffectiveTimeScale(grounded?speed/api.nominalSpeed:0);
    runAction.setEffectiveTimeScale(grounded?speed/api.nominalRunSpeed:0);
    clearPose();
    mixer.update(dt);
    // Restore terrain-adjusted bones before the next sample, including sparse clips.
    poseBones.forEach(bone=>basePose.set(bone,bone.quaternion.clone()));
    root.updateMatrixWorld(true);
    if(grounded)correctTerrain(motion.groundAt);
    api.state=!grounded?(launched&&airTime<.10?'takeoff':'airborne'):
      clipState==='land'?'landing':clipState==='stop'?'stopping':clipState;
  }
  let disposed = false;
  const api = {
    mixer, idleAction, walkAction, runAction, actions,
    motionMode:embeddedClips?'embedded':'legacy',
    source: embeddedClips?'embedded-locomotion':model.getObjectByName('B1_Rig')?.userData.asset_id?
      model.getObjectByName('B1_Rig').userData.asset_id+'-cmu-07-01-retarget':'kawaii-b1-v8-cmu-07-01-v2',
    forward: '+Z',
    groundOffset: 0,
    nominalSpeed: sourceSpeed * scale,
    nominalRunSpeed:runSpeed*scale,
    relaxedHandJoints:relaxedHands.size,
    motionSources:embeddedClips?Object.fromEntries(Object.entries(embeddedClips).map(([name,clip])=>[name,'embedded '+clip.name])):
      {run:embeddedRun?'embedded Run_Locomotion':'independent procedural authored run (not mocap)',jump:'procedural takeoff, flight and impact recovery'},
    state:'idle',
    update(dt, speed = 0, grounded = true, motion = {}){
      if(disposed || !Number.isFinite(dt) || dt <= 0) return;
      dt = Math.min(dt, 0.1);
      speed = Number.isFinite(speed) ? Math.abs(speed) : 0;
      if(embeddedClips){updateEmbedded(dt,speed,grounded,motion);return;}
      const walking = grounded && speed > 0.035;
      if(!grounded)stopAnchor=null;
      else if(!walking&&wasMoving&&footIK.length){
        root.updateMatrixWorld(true);
        let leg=null,lowest=Infinity;
        for(const candidate of footIK){
          let sole=Infinity;
          for(const {mesh,index} of candidate.vertices){
            mesh.getVertexPosition(index,solePoint).applyMatrix4(mesh.matrixWorld);
            sole=Math.min(sole,solePoint.y);
          }
          if(sole<lowest){lowest=sole;leg=candidate;}
        }
        root.getWorldPosition(rootPoint);
        stopAnchor=lowest<=rootPoint.y+.018?{leg,point:leg.foot.getWorldPosition(new THREE.Vector3()),
          rotation:leg.foot.getWorldQuaternion(new THREE.Quaternion()),weight:1,
          time:0,floor:lowest,origin:root.getWorldPosition(new THREE.Vector3()),
          heading:root.getWorldQuaternion(new THREE.Quaternion())}:null;
      }
      wasMoving=walking;
      clearPose();
      const running=walking&&speed>api.nominalSpeed*1.15&&
        (motion.running===true||speed>api.nominalSpeed*1.6);
      const vertical=Number.isFinite(motion.verticalSpeed)?motion.verticalSpeed:0;
      if(!grounded&&wasGrounded){airTime=0;launched=vertical>1;}
      if(!grounded)airTime+=dt;
      if(grounded&&!wasGrounded){landingTime=.20;landingStrength=Math.min(1,Math.max(.2,Math.abs(lastVertical)/5));}
      landingTime=Math.max(0,landingTime-dt);
      wasGrounded=grounded;
      lastVertical=vertical;
      airWeight+=((grounded?0:1)-airWeight)*(1-Math.exp(-18*dt));
      const fade=1-Math.exp(-12*dt);
      const next=walkAction.getEffectiveWeight()+((walking&&!running?1:0)-walkAction.getEffectiveWeight())*fade;
      const nextRun=runAction.getEffectiveWeight()+((running?1:0)-runAction.getEffectiveWeight())*fade;
      walkAction.setEffectiveWeight(next);runAction.setEffectiveWeight(nextRun);
      idleAction.setEffectiveWeight(Math.max(0,1-next-nextRun));
      if(walking)lastRate=speed/api.nominalSpeed;
      if(running)lastRunRate=speed/api.nominalRunSpeed;
      walkAction.setEffectiveTimeScale(!grounded?0:walking?lastRate:next>.02?lastRate*next:0);
      runAction.setEffectiveTimeScale(!grounded?0:walking?speed/api.nominalRunSpeed:nextRun>.02?lastRunRate*nextRun:0);
      mixer.update(dt);
      api.state=!grounded?(launched&&airTime<.10?'takeoff':'airborne'):landingTime>0?'landing':running?'run':walking?'walk':next+nextRun>.02?'stopping':'idle';
      const tuck=vertical>0?Math.min(.9,.25+airTime*4):.35;
      applyPose(tuck,Math.sin(Math.PI*landingTime/.20)*landingStrength);
      if(grounded)holdStoppedFoot(dt,walking);
      if(grounded)correctTerrain(motion.groundAt);
    },
    reset(){
      if(disposed) return;
      clearPose();airWeight=0;landingTime=0;lastRate=0;wasGrounded=true;airTime=0;lastVertical=0;launched=false;wasMoving=false;stopAnchor=null;api.state='idle';
      idleAction.reset().setEffectiveWeight(1).play();
      walkAction.reset().setEffectiveWeight(0).setEffectiveTimeScale(0).play();
      runAction.reset().setEffectiveWeight(0).setEffectiveTimeScale(0).play();
      if(embeddedClips){
        clipState='idle';
        for(const name of ['jump','land','stop'])actions[name].reset().setEffectiveTimeScale(1).setEffectiveWeight(0).play();
      }
      mixer.update(0);
      if(!embeddedClips)applyPose(0,0);
      root.updateMatrixWorld(true);
    },
    dispose(){
      if(disposed) return;
      disposed = true;
      clearPose();
      footIK.length=0;
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      disposeModel();
      root.removeFromParent();
    }
  };
  root.userData.kawaiiAnimation = api;
  if(!embeddedClips)applyPose(0,0);
  root.updateMatrixWorld(true);
  return root;
}
