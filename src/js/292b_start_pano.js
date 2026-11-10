// ══════════════════════════════════════════════════
//  START PANO — 開始位置の 360° 画像（2026-11-10）
//  オンライン版の物件シーンを開いた直後、開始位置から撮った 360° 画像（6 方向・各 90°）を 3D の上にかぶせる。
//  その場で見回している間は画像のまま（裏で 3D を読み続ける）、位置が動いたら（歩く・移動・ツアー・AR など）
//  画像を消して 3D に切り替える（2026-11-10 本人「この静止画を最初に挟むの、locahunでも採用」。内見版 naiken.js と同じ考え方）。
//
//  画像はサイトの /api/pano/<key>.json と /api/pano/<key>-{f,r,b,l,u,d}.jpg にある（無ければ 404 で何もしない）。
//  key = sha256('l3d-pano-v1:' + 中身の識別子)。中身の識別子は autoload の配信応答の ETag と長さ
//  （?ref=stream の RAD は "l3d-content-…" → 'content:<id>:<長さ>'、ZIP は R2 の ETag → 'etag:<etag>:<長さ>'）。シーン（ZIP）を作り直すと ETag が変わるので、古い画像は使われない。
//  画像はオンライン版の scripts/bake-pano.mjs が公開シーンを実ブラウザで開いて作る（このファイルの __startPano.key を使う）。
//  ?nopano=1 で使わない（撮影時・比較用）。
(function(){
  const qs = location.search;
  const st = { key: null, state: 'off', why: '' };
  window.__startPano = st;
  const m = /[?&]autoload=([^&]+)/.exec(qs);
  if(!m || /[?&]nopano=1/.test(qs)) return;
  let url = decodeURIComponent(m[1]);
  // 292 の autoload と同じ読み替え（オンライン版の ?protected=1 では /api/viewer-stream/ を通す）
  if(typeof _protected !== 'undefined' && _protected && !/^https?:\/\//.test(url) && !url.startsWith('blob:')){
    url = '/api/viewer-stream/' + url.replace(/^\/+/, '').replace(/^api\/(r2|viewer-stream)\//, '');
  }
  if(url.startsWith('blob:')) return;
  const FACES = { f: [0, 0], r: [-Math.PI / 2, 0], b: [Math.PI, 0], l: [Math.PI / 2, 0], u: [0, Math.PI / 2], d: [0, -Math.PI / 2] };
  let group = null, at = null, tex = [], gone = false, sceneSeen = false;

  async function identity(){
    const res = await fetch(url, { method: 'HEAD', credentials: 'same-origin', cache: 'no-cache' });
    const etag = res.headers.get('etag') || '', len = res.headers.get('content-length') || '';
    st.head = { url, status: res.status, etag, len };   // 診断用（キーが出ないときに見る）
    if(!res.ok) return null;
    const page = new URL(location.href), asset = new URL(url, page);
    if(asset.origin !== page.origin || !/^\d+$/.test(len)) return null;
    // ?ref=stream の RAD は中身の ETag、ZIP そのもの（物件ページの autoload）は R2 の強い ETag（サイトは同じ値をサーバー側でも計算できる）
    const mm = /^"l3d-content-([A-Za-z0-9_-]{8,200})"$/.exec(etag);
    if(mm) return 'content:' + mm[1] + ':' + len;
    const r2 = /^"([A-Za-z0-9_-]{8,200})"$/.exec(etag);
    return r2 ? 'etag:' + r2[1] + ':' + len : null;
  }
  async function sha256hex(s){
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(n => n.toString(16).padStart(2, '0')).join('');
  }
  function loadTex(src){
    return new Promise((ok, ng) => new THREE.TextureLoader().load(src, t => { t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; ok(t); }, undefined, ng));
  }
  function build(meta, maps){
    const g = new THREE.Group(); g.position.set(meta.pos.x, meta.pos.y, meta.pos.z);
    Object.keys(FACES).forEach((k, i) => {
      const [dy, p] = FACES[k];
      const pivot = new THREE.Object3D(); pivot.rotation.set(p, meta.yaw + dy + Math.PI, 0, 'YXZ');
      const mat = new THREE.MeshBasicMaterial({ map: maps[i], depthTest: false, depthWrite: false, transparent: true, toneMapped: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.004, 2.004), mat);
      mesh.position.set(0, 0, -1); mesh.renderOrder = 1e6; mesh.frustumCulled = false;
      pivot.add(mesh); g.add(pivot);
    });
    return g;
  }
  function remove(why){
    if(gone) return; gone = true; st.state = 'removed'; st.why = why;
    document.body.classList.remove('start-pano');
    if(!group) return;
    const g = group, t0 = performance.now();
    const step = () => {
      const a = Math.max(0, 1 - (performance.now() - t0) / 350);
      g.traverse(o => { if(o.material) o.material.opacity = a; });
      if(typeof markDirty === 'function') markDirty(4);
      if(a > 0) return requestAnimationFrame(step);
      scene.remove(g); g.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); tex.forEach(t => t.dispose()); group = null;
    };
    requestAnimationFrame(step);
  }
  const moved = () => {
    if(typeof walkMode !== 'undefined' && walkMode.active) return 'walk';
    if(typeof arMode !== 'undefined' && arMode.active) return 'ar';
    if(document.body.classList.contains('orbit-preview')) return 'orbit';
    if(camPos.distanceTo(at) > 0.03) return 'move';
    return '';
  };

  (async () => {
    try {
      st.state = 'identity';
      // 開いた直後の 1 回目はサイトの認証の受け渡しなどで中身の応答にならないことがあるので、少し待って 3 回まで試す
      let id = null;
      for(let i = 0; i < 3 && !id; i++){ if(i) await new Promise(r => setTimeout(r, 700 * i)); id = await identity().catch(() => null); }
      if(!id){ st.state = 'none'; st.why = 'no content id'; return; }
      st.key = await sha256hex('l3d-pano-v1:' + id);
      st.state = 'meta';
      const r = await fetch('/api/pano/' + st.key + '.json', { cache: 'no-cache' });
      if(!r.ok){ st.state = 'none'; st.why = 'no pano ' + r.status; return; }
      const meta = await r.json();
      if(!meta || meta.v !== 1 || !meta.pos || ![meta.pos.x, meta.pos.y, meta.pos.z, meta.yaw].every(Number.isFinite)){ st.state = 'none'; st.why = 'bad meta'; return; }
      st.state = 'faces';
      tex = await Promise.all(Object.keys(FACES).map(k => loadTex('/api/pano/' + st.key + '-' + k + '.jpg')));
      if(gone) return;
      at = new THREE.Vector3(meta.pos.x, meta.pos.y, meta.pos.z);
      // 開始位置・向きを画像と同じにしてから重ねる（シーンの読み込みも同じ開始位置を置く）
      camPos.copy(at); setCamRotImmediate(meta.yaw, Number.isFinite(meta.pitch) ? meta.pitch : 0);
      group = build(meta, tex); scene.add(group);
      document.body.classList.add('start-pano');
      st.state = 'shown';
      if(typeof markDirty === 'function') markDirty(10);
      const timer = setInterval(() => {
        if(gone){ clearInterval(timer); return; }
        // シーンの読み込みが開始位置を置き直す（同じ位置）まで動き判定はしない。読み込み前に歩かれたら消す
        // （読み込み直後はビューアーが一度カメラを置き直すことがあるので 1.5 秒待ち、そこで開始位置が違えば消す）
        if(!sceneSeen){ if(typeof layers !== 'undefined' && layers.some(L => L && L.type === 'splat' && L.mesh)) sceneSeen = performance.now(); return; }
        if(performance.now() - sceneSeen < 1500) return;
        const why = moved(); if(why) remove(why);
      }, 50);
    } catch(e){ st.state = 'error'; st.why = String(e && e.message || e); }
  })();
})();
