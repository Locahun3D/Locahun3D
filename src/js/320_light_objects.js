// ══════════════════════════════════════════════════
//  LIGHT OBJECTS
// ══════════════════════════════════════════════════
// Add scene lights (always present for lit-material objects)
const _ambientLight=new THREE.AmbientLight(0xffffff,0.6);
scene.add(_ambientLight);
const _dirLight=new THREE.DirectionalLight(0xffffff,0.8);
_dirLight.position.set(5,10,7);
scene.add(_dirLight);

window.addLightLayer = function(){
  const light=new THREE.PointLight(0xffffff,1.5,20);
  light.decay = 1; // softer linear falloff (default 2 = inverse-square = harsh edge)
  const camFwd=new THREE.Vector3(); camera.getWorldDirection(camFwd);
  const pos=camPos.clone().addScaledVector(camFwd,2);
  light.position.copy(pos);
  // Visible sphere for the light
  const sphere=new THREE.Mesh(
    new THREE.SphereGeometry(0.12,8,8),
    new THREE.MeshBasicMaterial({color:0xffee88,depthTest:false})
  );
  sphere.renderOrder=999;
  light.add(sphere);
  scene.add(light);
  const L=addLayer({name:'Light '+_nextLayerNameNumber('light'),type:'light',mesh:light});
  L.pos={x:pos.x,y:pos.y,z:pos.z};
  L.lightColor='#ffffff'; L.lightIntensity=1.5; L.lightDistance=20;
  selectLayer(L.id);
  showUndoToast(T('light-added'));
};

// Update light apply in applyLayerTransform
const _origApplyLayerTransform=applyLayerTransform;
// (light transform is handled in the existing applyLayerTransform via mesh.position)

