function _updateCollisionAvatarWalk(dt) {
  if(typeof camAnim!=='undefined' && camAnim.playing){_avatarWalkExit();return;}
  const av=walkMode.avatar;
  if(!av||!walkSetup.core)return;
  dt=Math.min(.05,Math.max(0,dt));
  if(!dt)return;
  let fw=(keys.KeyW?1:0)-(keys.KeyS?1:0),rt=(keys.KeyD?1:0)-(keys.KeyA?1:0);
  const jumpPressed=!!keys.Space||(typeof touchUpHeld!=='undefined'&&touchUpHeld);
  let running=!!(keys.ShiftLeft||keys.ShiftRight),jump=jumpPressed&&!walkMode.jumpHeld;
  jump ||= !!walkMode.jumpRequested;
  walkMode.jumpRequested=false;
  walkMode.jumpHeld=jumpPressed;
  let analogMagnitude=0;
  function analog(x,y) {
    const length=Math.hypot(x,y);
    analogMagnitude=Math.max(analogMagnitude,length);
    if(length<.02)return;
    const amount=Math.min(1,length*2);
    fw-=y/length*amount;rt+=x/length*amount;
  }
  analog(joyDX,joyDY);
  const gp=_readGamepadInput();
  if(gp) {
    analog(gp.lx,gp.ly);running ||= gp.sprint;jump ||= gp.aJustPressed;
    _yawTarget-=gp.rx*_GP_LOOK_SPEED*dt;
    _pitchTarget=Math.max(-1.55,Math.min(1.55,_pitchTarget-gp.ry*_GP_LOOK_SPEED*dt));
  }
  // Mouse and touch share the same joystick channel. Hysteresis prevents
  // repeated walk/run switches when a held pointer jitters at the outer zone.
  walkMode.analogRunning=analogMagnitude>(walkMode.analogRunning?.68:.78);
  running ||= walkMode.analogRunning;
  const magnitude=Math.hypot(fw,rt);
  if(magnitude>1){fw/=magnitude;rt/=magnitude;}
  const speed=running?(walkMode.runSpeed||walkMode.speed*walkMode.runMul):walkMode.speed;
  let targetX=(Math.sin(yaw)*fw-Math.cos(yaw)*rt)*speed;
  let targetZ=(Math.cos(yaw)*fw+Math.sin(yaw)*rt)*speed;
  if(magnitude>.02){
    const turn=Math.atan2(targetX,targetZ)-av.rotation.y;
    const alignment=.35+.65*Math.max(0,Math.cos(turn));
    targetX*=alignment;targetZ*=alignment;
  }
  const oldX=walkMode.moveX||0,oldZ=walkMode.moveZ||0;
  const reversing=magnitude>.02 && targetX*oldX+targetZ*oldZ<0;
  const acceleration=reversing?40:(magnitude>.02?(running?(walkMode.runAcceleration||10):4):10);
  const change=Math.hypot(targetX-oldX,targetZ-oldZ),limit=acceleration*dt;
  const blend=change>limit?limit/change:1;
  const dx=walkMode.moveX=oldX+(targetX-oldX)*blend;
  const dz=walkMode.moveZ=oldZ+(targetZ-oldZ)*blend;
  const moved=_walkCollisionAdvance(av,dt,dx,dz,jump);
  if(!walkMode.active)return;
  if(moved) {
    let delta=Math.atan2(dx,dz)-av.rotation.y;
    delta=Math.atan2(Math.sin(delta),Math.cos(delta));
    av.rotation.y+=delta*(1-Math.exp(-dt*10));
  }
  _avatarUpdateAnimation(dt,moved&&!walkMode.airborne,running?Math.max(1.01,speed/walkMode.speed):1);
  camPos.set(av.position.x-Math.sin(yaw)*walkMode.cameraDist,
    av.position.y+walkMode.groundOffset+walkMode.cameraHeight,
    av.position.z-Math.cos(yaw)*walkMode.cameraDist);
  _walkCameraCollision(av);
  _avatarWalkCameraVisibility(av);
  if(walkMode.groundDisc){
    walkMode.groundDisc.position.set(av.position.x,walkMode.groundY+.01,av.position.z);
    walkMode.groundDisc.visible=!walkMode.airborne;
  }
  // Mixer must continue through the stop blend even after movement ceases.
  markDirty(2);
}
