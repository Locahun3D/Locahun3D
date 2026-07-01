// ══════════════════════════════════════════════════
//  ENVIRONMENT  (procedural sky dome / pseudo-HDRI)
// ══════════════════════════════════════════════════
// A large inverted sphere with a fragment shader that samples a 2-stop sky gradient
// (zenith → horizon → ground). The shader takes a yaw uniform so the sky can be
// rotated around the world Y axis — useful for matching the splat scene's lighting
// direction for previz. Each preset is a (zenith, horizon, ground) color set chosen
// to evoke morning / day / evening / night / overcast / rain / etc.
// Each preset has:
//   - sky colors (zenith / horizon / ground) for the procedural sky dome
//   - sceneTint: a (r,g,b) multiplier that gets applied to the WHOLE rendered scene
//     so splats and OBJ models appear to be lit by that environment.
//     Reference: rgb(1,1,1) = no change. Lower values darken / colorize the scene.
const ENV_PRESETS = {
  off:      null,
  day:      { zenith:[0.36,0.62,0.95], horizon:[0.85,0.92,1.00], ground:[0.55,0.55,0.55], int:1.0,
              sceneTint:[1.00, 1.00, 1.00] },
  morning:  { zenith:[0.55,0.65,0.85], horizon:[1.00,0.78,0.55], ground:[0.50,0.45,0.40], int:1.0,
              sceneTint:[1.00, 0.92, 0.78] },
  evening:  { zenith:[0.30,0.25,0.50], horizon:[1.00,0.55,0.32], ground:[0.30,0.22,0.20], int:1.0,
              sceneTint:[0.95, 0.65, 0.45] },
  twilight: { zenith:[0.10,0.10,0.30], horizon:[0.65,0.40,0.55], ground:[0.18,0.15,0.20], int:1.0,
              sceneTint:[0.55, 0.45, 0.62] },
  night:    { zenith:[0.02,0.02,0.08], horizon:[0.06,0.08,0.18], ground:[0.04,0.04,0.06], int:1.0,
              sceneTint:[0.20, 0.25, 0.42] },
  cloudy:   { zenith:[0.50,0.52,0.56], horizon:[0.72,0.74,0.76], ground:[0.40,0.40,0.40], int:1.0,
              sceneTint:[0.78, 0.80, 0.84] },
  overcast: { zenith:[0.62,0.64,0.68], horizon:[0.82,0.84,0.86], ground:[0.45,0.45,0.45], int:1.0,
              sceneTint:[0.85, 0.87, 0.90] },
  rain:     { zenith:[0.28,0.30,0.34], horizon:[0.46,0.48,0.50], ground:[0.25,0.27,0.30], int:1.0,
              sceneTint:[0.55, 0.62, 0.70] },
  // 日照モード専用の動的プリセット。太陽高度に応じて updateSunMode() が
  // 毎フレーム書き換える。手動プリセットと同じ機構（ドーム / sceneTint /
  // 写真焼き込み）にそのまま乗るので、追加の特別扱いは不要。
  __sun:    { zenith:[0.36,0.62,0.95], horizon:[0.85,0.92,1.00], ground:[0.55,0.55,0.55], int:1.0,
              sceneTint:[1.00, 1.00, 1.00] },
};
const env = {
  preset: 'day',     // default to ☀ 昼 (was 'off') — applied at startup below
  rot: 0,            // kept for shader uniform compatibility; UI control removed
  intensity: 1.0,
  mesh: null,
  material: null,
  panelOpen: false,
};

function _envBuildMesh(){
  if(env.mesh) return env.mesh;
  const geo = new THREE.SphereGeometry(900, 48, 32);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith:    { value: new THREE.Color(0.36,0.62,0.95) },
      uHorizon:   { value: new THREE.Color(0.85,0.92,1.00) },
      uGround:    { value: new THREE.Color(0.55,0.55,0.55) },
      uYaw:       { value: 0.0 },
      uIntensity: { value: 1.0 },
      // ── Sun disc (日照 mode) ──
      uShowSun:   { value: 0.0 },                              // 0 = no sun (manual env), 1 = draw
      uSunDir:    { value: new THREE.Vector3(0, 1, 0) },       // WORLD direction toward the sun
      uSunColor:  { value: new THREE.Color(1.0, 0.95, 0.85) }, // disc + glow tint
      uSunGlow:   { value: 1.0 },                              // glow strength (fades near/below horizon)
      // ── Procedural clouds (日照モードのみ) ──
      uCloudAmt:  { value: 0.0 },                              // 0 = clear sky, 1 = full overcast (coverage)
      uCloudTime: { value: 0.0 },                              // drift animation seconds
      uCloudLight:{ value: 1.0 },                              // sunlit-top whiteness (lowered for rain)
    },
    vertexShader: `
      varying vec3 vDir;
      uniform float uYaw;
      void main(){
        float c = cos(uYaw), s = sin(uYaw);
        vec3 p = position;
        vec3 r = vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z);
        vDir = normalize(r);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      uniform float uIntensity;
      uniform float uShowSun;
      uniform vec3  uSunDir;
      uniform vec3  uSunColor;
      uniform float uSunGlow;
      uniform float uCloudAmt;
      uniform float uCloudTime;
      uniform float uCloudLight;
      // ── value-noise FBM (procedural clouds) ──
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float vnoise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = h21(i), b = h21(i + vec2(1.0, 0.0));
        float c = h21(i + vec2(0.0, 1.0)), d = h21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        mat2 m = mat2(1.6, 1.2, -1.2, 1.6);   // rotate+scale each octave to kill axis artifacts
        for(int i = 0; i < 6; i++){ v += a * vnoise(p); p = m * p; a *= 0.5; }
        return v;
      }
      void main(){
        float y = vDir.y;
        vec3 col;
        if(y > 0.0){
          float t = pow(clamp(y, 0.0, 1.0), 0.55);
          col = mix(uHorizon, uZenith, t);
        } else {
          float t = pow(clamp(-y, 0.0, 1.0), 0.7);
          col = mix(uHorizon, uGround, t);
        }
        // ── procedural clouds: 視線を雲層平面へ投影 → 地平線に向かって雲が収束する ──
        if(uCloudAmt > 0.001 && vDir.y > 0.0){
          // 平面投影（分母に定数＝地平線付近の極端な伸びを抑える）
          vec2 uv = (vDir.xz / (vDir.y * 0.85 + 0.18)) * 0.5;
          // 雲を Y方向（奥行き=画面の縦方向）へ一定速度で流す＝手前の地平から頭上へ立ち上がる動き。
          // 全層を同じ量だけ平行移動（剛体）→ その場回転/churn にならない。
          vec2 p = uv - vec2(0.0, uCloudTime * 0.05);
          float base   = fbm(p);
          float detail = fbm(p * 2.7);
          float n = base * 0.62 + detail * 0.38;                 // multi-scale wisps
          float cov = clamp(uCloudAmt, 0.0, 1.0);
          // 気象庁の雲量定義(空を覆う割合)に一致させる較正。実測ノイズ分布の分位点から逆算し、
          // 「雲で覆われる面積割合 ≈ 雲量cov」になるしきい値(mid)を求める（cov→mid はほぼ線形、上端で完全曇天へ）。
          float mid = 0.642 - 0.303 * cov - 0.34 * smoothstep(0.85, 1.0, cov);
          float density = smoothstep(mid - 0.055, mid + 0.055, n);
          density *= smoothstep(0.02, 0.24, vDir.y);             // haze-fade near horizon (no singularity)
          // shading: sunlit top vs shadowed underside (underside follows sky → dark in rain)
          float lit = clamp(fbm(p * 1.3 + normalize(uSunDir).xz * 0.28) * 1.35, 0.0, 1.0);
          vec3 cloudBase = mix(uHorizon, uZenith, 0.35) * 0.55;
          vec3 cloudTop  = mix(vec3(1.0), uSunColor, 0.4);
          vec3 cloudCol  = mix(cloudBase, cloudTop, lit * uCloudLight);
          col = mix(col, cloudCol, density);
        }
        // ── 日照モード: 太陽方向への暖色グロー＋ディスク ──
        // uShowSun=0（手動環境 or 太陽が地平線下）のとき完全に無効。
        if(uShowSun > 0.5){
          vec3  sd = normalize(uSunDir);
          float md = max(dot(normalize(vDir), sd), 0.0);
          // 太陽ディスク（角半径 ~0.5°相当）
          float disc = smoothstep(0.99965, 0.99992, md);
          // 周辺グロー: 鋭い芯 + 広いにじみ
          float glow = pow(md, 230.0) * 0.85 + pow(md, 11.0) * 0.22;
          // 低い太陽（地平線近く）ほどにじみを強める
          float lowSun = smoothstep(0.35, -0.08, sd.y);
          glow *= (0.55 + 0.85 * lowSun);
          float sun = clamp((disc + glow * uSunGlow), 0.0, 1.0);
          col = mix(col, uSunColor, sun);
        }
        gl_FragColor = vec4(col * uIntensity, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = -10000;   // render BEFORE everything else (background)
  m.userData.isEnvDome = true;
  scene.add(m);
  env.mesh = m;
  env.material = mat;
  return m;
}

window.setEnvPreset = function(key){
  // 手動でプリセットを選んだときだけ、日照の凍結表示を解除して key に置き換える。
  // （日照ボタンOFFだけでは __sun が凍結保持され続け、ここで初めて上書きされる）
  const before = env.preset;
  if(typeof sun !== 'undefined' && sun && sun.active) _setSunActive(false);
  _setEnvPresetCore(key);
  pushGenericUndo('env-preset', before, key, v=>{
    _setEnvPresetCore(v);
  });
};
function _setEnvPresetCore(key){
  env.preset = key;
  // 手動プリセット/なし は太陽ディスク＋プロシージャル雲を持たない
  // （日照モードのみ updateSunMode で再点灯・雲量を設定）。起動時の day 背景も雲なしのまま。
  if(env.material){ env.material.uniforms.uShowSun.value = 0; env.material.uniforms.uCloudAmt.value = 0; }
  document.querySelectorAll('#env-panel .env-btn').forEach(b=>{
    b.classList.toggle('on', b.dataset.env === key);
  });
  if(key === 'off'){
    if(env.mesh) env.mesh.visible = false;
    applySceneTint();
    markDirty(6);
    return;
  }
  const p = ENV_PRESETS[key];
  if(!p) return;
  const mesh = _envBuildMesh();
  mesh.visible = true;
  env.material.uniforms.uZenith.value.setRGB(...p.zenith);
  env.material.uniforms.uHorizon.value.setRGB(...p.horizon);
  env.material.uniforms.uGround.value.setRGB(...p.ground);
  env.material.uniforms.uIntensity.value = (p.int || 1.0) * env.intensity;
  // Keep dome centered on camera so it always feels "infinite"
  mesh.position.copy(camPos);
  // Apply pseudo-lighting to splats / models via the scene-tint overlay
  applySceneTint();
  markDirty(6);
}

// Drive the global scene-tint overlay from the active env preset + intensity slider.
// Multiplies the rendered scene by the preset's sceneTint color, so splats and OBJ
// models appear "re-lit" by the environment without modifying any material.
// Intensity slider controls how strongly we lerp from white (no effect) to the tint.
function applySceneTint(){
  const tint = document.getElementById('env-tint');
  if(!tint) return;
  if(env.preset === 'off' || !ENV_PRESETS[env.preset] || !ENV_PRESETS[env.preset].sceneTint){
    tint.style.display = 'none';
    return;
  }
  const t = ENV_PRESETS[env.preset].sceneTint;
  const k = Math.max(0, Math.min(2, env.intensity));   // 0–200 % from slider
  // Lerp white → preset tint by k (capped at 1 for the tint side; values >1 darken further)
  const mix = (a, b) => a * (1 - Math.min(1, k)) + b * Math.min(1, k);
  let r = mix(1, t[0]);
  let g = mix(1, t[1]);
  let b = mix(1, t[2]);
  // Beyond 100% intensity, push the tint further (extra darken/saturate)
  if(k > 1){
    const extra = k - 1;
    r *= (1 - extra * 0.5);
    g *= (1 - extra * 0.5);
    b *= (1 - extra * 0.5);
  }
  tint.style.display = 'block';
  tint.style.background =
    `rgb(${Math.round(Math.max(0,Math.min(1,r))*255)}, ` +
    `${Math.round(Math.max(0,Math.min(1,g))*255)}, ` +
    `${Math.round(Math.max(0,Math.min(1,b))*255)})`;
}

function _applyEnvRot(rotDeg){
  env.rot = +rotDeg;
  const el=document.getElementById('env-rot-val'); if(el) el.textContent = (env.rot|0) + '°';
  const sl=document.getElementById('env-rot');     if(sl) sl.value = env.rot;
  if(env.material) env.material.uniforms.uYaw.value = THREE.MathUtils.degToRad(env.rot);
  markDirty(2);
}
window.onEnvRotInput = function(v){
  const before = env.rot;
  _applyEnvRot(v);
  pushGenericUndo('env-rot', before, +v, val=>_applyEnvRot(val));
};

function _applyEnvInt(pct){
  env.intensity = (+pct) / 100;
  const el=document.getElementById('env-int-val'); if(el) el.textContent = (+pct|0) + '%';
  const sl=document.getElementById('env-int');     if(sl) sl.value = pct;
  if(env.material && env.preset !== 'off'){
    const p = ENV_PRESETS[env.preset];
    if(p) env.material.uniforms.uIntensity.value = (p.int || 1.0) * env.intensity;
  }
  applySceneTint();
  markDirty(2);
}
window.onEnvIntInput = function(v){
  const before = Math.round(env.intensity * 100);
  _applyEnvInt(v);
  pushGenericUndo('env-int', before, +v, val=>_applyEnvInt(val));
};

window.toggleEnvPanel = function(){
  const wasOpen = env.panelOpen;
  // Mutual-exclusion: opening any of 測定 / カメラ / 環境 / マップ /
  // 画質 closes the other four. Closing this panel doesn't reopen them.
  if(!wasOpen) closeAllPanels();
  env.panelOpen = !wasOpen;
  const pan = document.getElementById('env-panel');
  const btn = document.getElementById('btn-env');
  if(pan) pan.style.display = env.panelOpen ? 'block' : 'none';
  if(btn) btn.classList.toggle('on', env.panelOpen);
};
// Apply the default ☀ 昼 preset at startup so the dome + scene tint are
// active on first load (the env object's `preset:'day'` default would
// otherwise only take effect after the user clicked a button).
try { _setEnvPresetCore('day'); } catch(_){}
camera.position.copy(camPos);

