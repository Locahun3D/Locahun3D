// Private review harness only. Call after the pose's world matrices are current.
export function createElbowMorphDriver(root,{mesh,samples,neutralAngle,side='Right'}){
  if(!Number.isFinite(neutralAngle)||neutralAngle<0)throw new Error('Explicit neutral angle required');
  const bones=['Arm','ForeArm','Hand'].map(n=>root.getObjectByName(side+n));
  if(bones.some(b=>!b))throw new Error('Elbow chain missing');
  const targets=samples.map(s=>({...s,index:mesh.morphTargetDictionary?.[s.name]}));
  if(!targets.length||targets.some((s,i)=>!Number.isInteger(s.index)||!Number.isFinite(s.angle)||s.angle<=(i?targets[i-1].angle:neutralAngle)))throw new Error('Invalid morph samples');
  if(new Set(targets.map(s=>s.index)).size!==targets.length)throw new Error('Duplicate corrective target');
  const weights=mesh.morphTargetInfluences;
  if(!weights||targets.some(s=>s.index>=weights.length))throw new Error('Morph influence array missing');
  let disposed=false,enabled=false,outsideValidatedRange=false;
  function clear(){for(const t of targets)weights[t.index]=0;}
  function reset(){clear();enabled=false;outsideValidatedRange=false;}
  return {
    reset,
    setEnabled(value){enabled=!disposed&&value===true;clear();outsideValidatedRange=false;},
    get outsideValidatedRange(){return outsideValidatedRange;},
    update(){
      if(disposed||!enabled)return null;
      clear();outsideValidatedRange=false;
      const a=bones[0].matrixWorld.elements,b=bones[1].matrixWorld.elements,c=bones[2].matrixWorld.elements;
      const ux=b[12]-a[12],uy=b[13]-a[13],uz=b[14]-a[14];
      const vx=c[12]-b[12],vy=c[13]-b[13],vz=c[14]-b[14];
      const length=Math.hypot(ux,uy,uz)*Math.hypot(vx,vy,vz);
      if(!Number.isFinite(length)||length<1e-12)return null;
      const angle=Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy+uz*vz)/length)))*180/Math.PI;
      outsideValidatedRange=angle>targets.at(-1).angle+1e-8;
      if(angle<=neutralAngle+1e-8)return angle;
      for(let i=0;i<targets.length;i++){
        const t=targets[i];
        if(angle<=t.angle){
          const previous=i?targets[i-1].angle:neutralAngle;
          const blend=Math.max(0,Math.min(1,(angle-previous)/(t.angle-previous)));
          weights[t.index]=blend;if(i)weights[targets[i-1].index]=1-blend;
          return angle;
        }
      }
      weights[targets.at(-1).index]=1;return angle;
    },
    dispose(){reset();disposed=true;}
  };
}
