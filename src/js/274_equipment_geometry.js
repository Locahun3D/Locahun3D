// Original dimensioned location-planning meshes. Meters, Y up, vehicle front +Z.
// No manufacturer mesh, texture, logo, or CAD data is redistributed.
(() => {
  const catalog = [
    {id:'hiace',category:'vehicles',name:'ハイエース',en:'HiAce',variant:'標準幅・標準ルーフ',variantEn:'Standard roof / width',dimensions:'4.695 × 1.695 × 1.980 m'},
    {id:'truck2t',category:'vehicles',name:'2Tトラック',en:'2T truck',variant:'ダイナ・標準平ボディ',variantEn:'Dyna / standard flatbed',dimensions:'4.690 × 1.695 × 1.965 m'},
    {id:'truck4t',category:'vehicles',name:'4Tトラック',en:'4T truck',variant:'フォワード・ワイド平ボディ',variantEn:'Forward / wide flatbed',dimensions:'8.485 × 2.470 × 2.550 m'},
    {id:'jib',category:'equipment',name:'ジブクレーン',en:'Jib crane',variant:'Jimmy Jib Standard・水平',variantEn:'Jimmy Jib Standard / level',dimensions:'アーム全長 3.15 m'},
    {id:'scorpio',category:'equipment',name:'スコーピオンクレーン',en:'Scorpio crane',variant:'23’L・最大伸長・水平',variantEn:'23’L / fully extended / level',dimensions:'前方 7.16 m / 後方 2.02 m'},
    {id:'lightstand',category:'equipment',name:'照明スタンド',en:'Lighting stand',variant:'1004BAC・最大伸長',variantEn:'1004BAC / fully extended',dimensions:'高さ 3.66 m / 開脚径 1.06 m'},
  ].map(Object.freeze);
  function build(T, id) {
    const item = catalog.find(item => item.id === id);
    if (!item) throw new Error('Unknown equipment: ' + id);
    const root = new T.Group(); root.name = item.en;
    root.userData = {equipmentId:id,representation:'original planning proxy',units:'meters'};
    const colors = {body:0xe0e3e5,trim:0x30363b,rubber:0x202326,glass:0x47616b,metal:0x98a2a8,
      bed:0x9dadaf,red:0xbd4541,white:0xf3eed3,black:0x373c40,accent:0xb49448};
    function part(geo, color, pos, name) {
      const mesh = new T.Mesh(geo, new T.MeshBasicMaterial({color:colors[color] ?? color}));
      mesh.position.set(...pos); mesh.name = name || color; root.add(mesh); return mesh;
    }
    const box = (size, pos, color='body', name) => part(new T.BoxGeometry(...size), color, pos, name);
    function rod(a, b, radius, color='metal', name) {
      const start=new T.Vector3(...a), end=new T.Vector3(...b), dir=end.clone().sub(start);
      const mesh=part(new T.CylinderGeometry(radius,radius,dir.length(),12),color,start.add(end).multiplyScalar(.5).toArray(),name);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize()); return mesh;
    }
    function wheel(x,y,z,r=.31,width=.18) {
      const tire=part(new T.CylinderGeometry(r,r,width,20), 'rubber',[x,y,z],'tire');tire.rotation.z=Math.PI/2;
      const hub=part(new T.CylinderGeometry(r*.56,r*.56,width+.003,16),'metal',[x,y,z],'wheel-hub');hub.rotation.z=Math.PI/2;
    }
    function profile(points,width,color,name) {
      const shape=new T.Shape();points.forEach(([z,y],i)=>i?shape.lineTo(-z,y):shape.moveTo(-z,y));shape.closePath();
      const geo=new T.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false,steps:1});
      geo.rotateY(Math.PI/2);geo.translate(-width/2,0,0);return part(geo,color,[0,0,0],name);
    }
    function frontPanel(points,z,color,name){
      const shape=new T.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
      return part(new T.ShapeGeometry(shape),color,[0,0,z],name);
    }
    function glazing(width,front,back,bottom,top) {
      // Individual side panes and pillars keep the cab-over/van silhouette readable.
      for(const side of [-1,1]){
        const pane=box([.008,top-bottom,front-back],[side*(width/2-.004),(bottom+top)/2,(front+back)/2],'glass','side-window');
        pane.material.polygonOffset=true;pane.material.polygonOffsetFactor=-2;pane.material.polygonOffsetUnits=-2;
      }
    }
    function vehicle() {
      const van=id==='hiace',large=id==='truck4t';
      const length=van?4.695:large?8.485:4.69, width=large?2.47:1.695, height=van?1.98:large?2.55:1.965;
      const f=length/2, r=large?.41:.31, frontAxle=f-(large?1.20:1.00), rearAxle=frontAxle-(van?2.57:large?4.86:2.545);
      const cabWidth=large?2.30:width;
      box([width*.62,.17,length-.18],[0,r+.1,0],'trim','chassis');
      for(const z of [frontAxle,rearAxle])for(const side of [-1,1])wheel(side*(width/2-.11),r,z,r,.20);
      if(!van)for(const side of [-1,1])wheel(side*(width/2-.32),r,rearAxle,r,.19);
      if(van) {
        const bottom=[[-f+.01,.34]];
        for(const z of [rearAxle,frontAxle]) {
          for(let i=0;i<=8;i++){const a=Math.PI-i*Math.PI/8;bottom.push([z+.345*Math.cos(a),.34+.345*Math.sin(a)]);}
        }
        bottom.push([f-.01,.34],[f-.01,1.12],[f-.30,1.86],[f-.48,height],[-f+.10,height],[-f+.01,1.83]);
        profile(bottom,width-.006,'body','van-body');
        glazing(width,f-.40,f-1.26,1.24,1.78);
        for(const [a,b] of [[f-1.38,-.78],[-.91,-f+.17]])glazing(width,a,b,1.19,1.73);
        const windshield=box([width-.15,.64,.003],[0,1.52,f-.01-(1.52-1.12)*.29/.74+.001],'glass','windshield');
        windshield.rotation.x=-Math.atan(.29/.74);
        box([width-.20,.54,.012],[0,1.48,-f-.001+.009],'glass','rear-window');
        for(const side of [-1,1]) {
          box([.01,.018,1.42],[side*(width/2-.005),1.0,-.1],'trim','sliding-door-rail');
          box([.018,.035,.18],[side*(width/2-.01),1.12,.70],'trim','door-handle');
        }
      } else {
        const cabBack=f-(large?1.96:1.48);
        const outline=[[cabBack,.40]];
        for(let i=0;i<=12;i++){const a=Math.PI-i*Math.PI/12;outline.push([frontAxle+(r+.045)*Math.cos(a),.40+(r+.045)*Math.sin(a)]);}
        outline.push([f-.01,.40],[f-.01,height*.60],[f-.16,height-.09],[f-.30,height],[cabBack+.10,height],[cabBack,height-.12]);
        profile(outline,cabWidth-.006,'body','cab');
        glazing(cabWidth,f-.22,cabBack+.14,height*.64,height-.14);
        const slope=.15/(height*.40-.09),windY=height*.79;
        const wind=box([cabWidth-.17,height*.30,.003],[0,windY,f-.01-(windY-height*.60)*slope+.001],'glass','windshield');wind.rotation.x=-Math.atan(slope);
        const bedFront=cabBack-.13, bedRear=-f+.04, bedLength=bedFront-bedRear, deck=large?1.09:.78;
        box([width,.12,bedLength],[0,deck-.06,(bedFront+bedRear)/2],'bed','flatbed-floor');
        for(const side of [-1,1]) {
          box([.035,.38,bedLength],[side*(width/2-.0175),deck+.19,(bedFront+bedRear)/2],'body','sideboard');
          for(let z=bedRear+.22;z<bedFront;z+=large?1.18:.72)box([.04,.35,.038],[side*(width/2-.02),deck+.18,z],'metal','sideboard-upright');
        }
        box([width,.38,.04],[0,deck+.19,bedRear],'body','tailgate');
        box([width,.055,.07],[0,height-.03,bedFront],'metal','headboard-top');
        for(const x of [-width/2+.04,width/2-.04])box([.06,height-deck,.07],[x,(height+deck)/2,bedFront],'metal','headboard');
        // Flatbeds remain open; no generic box body substituted for a truck variant.
      }
      box([cabWidth-.04,van?.24:.28,.06],[0,van?.46:.47,f-.04],'body','front-bumper');
      box([cabWidth*.64,.12,.012],[0,.51,f-.011],'trim','lower-intake');
      box([width-.08,.12,.08],[0,.34,-f+.04],'trim','rear-bumper');
      box([cabWidth*(large?.67:.50),large?.48:.14,.008],[0,van?.82:height*.46,f-.010],'trim','grille');
      const grilleY=van?.82:height*.46;
      for(const offset of (large?[-.14,.07]:[-.045,.045])){
        if(large){const w=cabWidth*.325,y=grilleY+offset;frontPanel([[-w,y+.045],[-w+.10,y-.015],[w-.10,y-.015],[w,y+.045],[w,y+.075],[-w,y+.075]],f-.002,'metal','grille-slats');}
        else box([cabWidth*.49,.018,.006],[0,grilleY+offset,f-.003],'metal','grille-slats');
      }
      box([.33,.165,.008],[0,.44,f-.004],'white','number-plate');
      const glass=root.getObjectByName('windshield');glass.updateMatrixWorld(true);
      for(const side of [-1,1]){
        const a=new T.Vector3(side*cabWidth*.22,-(van?.64:height*.27)*.41,.015).applyMatrix4(glass.matrixWorld);
        const b=new T.Vector3(side*cabWidth*.22+cabWidth*.18,-(van?.64:height*.27)*.30,.015).applyMatrix4(glass.matrixWorld);
        rod(a.toArray(),b.toArray(),.009,'trim','windshield-wipers');
      }
      for(const side of [-1,1]) {
        if(large){
          const cx=side*cabWidth*.415,cy=height*.43;
          const polygon=(w,h)=>{const p=[[cx-w,cy+h],[cx+w,cy+h],[cx+w,cy-h],[cx-w+.04,cy-h]];return p.reverse();};
          frontPanel(polygon(.135,.255),f-.003,'trim','headlamp-surround');
          frontPanel(polygon(.092,.18),f-.001,'white','headlamp');
        }else{
          box([cabWidth*.20,van?.20:.23,.025],[side*cabWidth*.34,van?.98:height*.43,f-.015],'trim','headlamp-surround');
          box([cabWidth*.17,van?.16:.19,.012],[side*cabWidth*.34,van?.98:height*.43,f-.006],'white','headlamp');
        }
        box([.06,.08,.009],[side*cabWidth*.42,van?1.01:height*.45,f-.005],'accent','indicator');
        box([.12,.17,.035],[side*(width*.42),.61,-f+.025],'red','tail-lamp');
        const x=side*(cabWidth/2-.006),doorBack=f-(van?1.27:large?1.83:1.36);
        box([.004,height*.44,.006],[x,height*.48,doorBack],'trim','door-seam');
        box([.012,.035,.14],[x,height*.60,doorBack+.16],'trim','cab-door-handle');
        box([.035,.06,.35],[side*(cabWidth/2-.019),.42,frontAxle-.46],'trim','door-step');
        const mirrorX=side*(cabWidth/2+(van?.105:.18)),mirrorY=height*.72,mirrorZ=f-(van?.40:.25);
        const arm=rod([x,mirrorY-.12,mirrorZ-.08],[mirrorX,mirrorY-.09,mirrorZ],.014,'trim','mirror-arm');arm.userData.mirror=true;
        const housing=box([van?.16:.15,van?.20:large?.40:.29,.11],[mirrorX,mirrorY,mirrorZ],'trim','mirror-housing');housing.userData.mirror=true;
        const mirror=box([van?.13:.12,van?.17:large?.36:.25,.005],[mirrorX,mirrorY,mirrorZ-.057],'metal','mirror-glass');mirror.userData.mirror=true;
        if(!van){
          box([.12,.07,large?2.15:.73],[side*(width/2-.10),.44,(frontAxle+rearAxle)/2],'metal','side-underrun-guard');
          box([.035,.30,.28],[side*(width/2-.02),.37,rearAxle-.35],'rubber','mudflap');
        }
      }
    }
    function stand() {
      // 1.06m circumscribed foot circle, three legs, four telescoping sections.
      const footRadius=.518;
      for(let i=0;i<3;i++) {
        const a=i*Math.PI*2/3, foot=[Math.sin(a)*footRadius,.012,Math.cos(a)*footRadius];
        rod([0,.85,0],foot,.011,'black','leg');
        rod([0,.22,0],[foot[0]*.70,.26,foot[2]*.70],.008,'metal','brace');
        const end=part(new T.SphereGeometry(.012,8,6),'rubber',foot,'foot');
        end.scale.set(1,1,1);
      }
      for(const [y0,y1,r] of [[.16,1.16,.0175],[1.10,2.05,.015],[2,2.90,.0125],[2.85,3.61,.01]]) {
        rod([0,y0,0],[0,y1,0],r,'black','telescoping-column');
        box([.061,.04,.04],[.01,y1-.035,0],'trim','clamp');
      }
      rod([0,3.61,0],[0,3.66,0],.008,'metal','spigot');
    }
    function crane() {
      const scorpio=id==='scorpio', pivot=scorpio?1.72:1.74, reach=scorpio?7.16:2.12, tail=scorpio?2.02:1.03;
      if(scorpio) {
        box([.68,.18,1.2],[0,.30,0],'black','dolly');
        for(const x of [-.64,.64])for(const z of [-.62,.62]) {
          rod([x*.3,.30,z*.5],[x,.21,z],.055,'metal','dolly-outrigger');wheel(x,.14,z,.14,.12);
        }
        rod([0,.35,0],[0,pivot-.12,0],.13,'black','column');
        box([.50,.20,.65],[0,pivot-.06,0],'black','pan-bearing');
        box([.34,.40,tail+2.55],[0,pivot,(2.55-tail)/2],'black','outer-boom');
        box([.28,.31,2.35],[0,pivot,3.40],'metal','middle-boom');
        box([.21,.23,2.95],[0,pivot,5.65],'black','inner-boom');
        for(const side of [-1,1])rod([side*.18,pivot+.14,-tail+.1],[side*.18,pivot+.14,2.48],.009,'metal','drive-cable');
        box([.77,.44,.60],[0,pivot-.08,-tail+.30],'trim','counterweights');
      } else {
        for(let i=0;i<3;i++) {
          const a=i*2*Math.PI/3,x=Math.sin(a)*.70,z=Math.cos(a)*.70;
          rod([0,pivot-.25,0],[x,.18,z],.038,'metal','tripod-leg');wheel(x,.095,z,.095,.055);
        }
        rod([0,.45,0],[0,pivot-.02,0],.06,'black','tripod-column');
        // Closed triangular-section beam, not an unrelated lattice construction crane.
        const tri=new T.Shape();tri.moveTo(-.105,-.075);tri.lineTo(.105,-.075);tri.lineTo(0,.12);tri.closePath();
        const geo=new T.ExtrudeGeometry(tri,{depth:reach+tail,bevelEnabled:false});
        part(geo,'metal',[0,pivot,-tail],'triangular-boom');
        for(const side of [-1,1])rod([side*.105,pivot+.14,-tail],[side*.105,pivot+.14,reach],.005,'black','leveling-cable');
        rod([-.42,pivot,-tail+.18],[.42,pivot,-tail+.18],.025,'metal','weight-bar');
        for(const side of [-1,1]){
          const w=part(new T.CylinderGeometry(.18,.18,.20,16),'trim',[side*.30,pivot,-tail+.18],'counterweight');w.rotation.z=Math.PI/2;
        }
      }
      const mount = new T.Group();mount.name='camera-mount';mount.position.set(0,pivot,reach);root.add(mount);
      box([.09,.44,.10],[0,pivot-.18,reach],'black','remote-head-upright');
      box([.32,.06,.24],[0,pivot-.42,reach],'metal','camera-platform');
      box([.22,.16,.27],[0,pivot-.30,reach-.015],'trim','camera-body');
      const lens=part(new T.CylinderGeometry(.060,.068,.12,14),'black',[0,pivot-.30,reach+.17],'lens');lens.rotation.x=Math.PI/2;
    }
    if(item.category==='vehicles')vehicle();else if(id==='lightstand')stand();else crane();
    root.updateMatrixWorld(true);
    // Bake restrained directional shading into vertices for the viewer's unlit OBJ path.
    const light=new T.Vector3(-.5,1,.7).normalize();
    root.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const normals=mesh.geometry.attributes.normal,shade=new Float32Array(normals.count*3),n=new T.Vector3();
      const matrix=new T.Matrix3().getNormalMatrix(mesh.matrixWorld);
      for(let i=0;i<normals.count;i++) {
        n.fromBufferAttribute(normals,i).applyMatrix3(matrix).normalize();
        const value=.68+.32*Math.max(0,n.dot(light));shade.set([value,value,value],i*3);
      }
      mesh.geometry.setAttribute('color',new T.BufferAttribute(shade,3));mesh.material.vertexColors=true;
    });
    return root;
  }
  globalThis.LocahunEquipment=Object.freeze({catalog:Object.freeze(catalog),build});
})();
