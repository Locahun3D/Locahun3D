// ══════════════════════════════════════════════════
//  ?showcase=1 — 機能ツアー（自動おさらい再生）
//
//  デモ誘導リンクの着地点 `?demo=1&showcase=1` 専用のモード。シーン読込が
//  終わったあと、ビューアーの主要機能を 1 章ずつ自動で実演する。
//
//  設計方針:
//   • UI は消さない。?orbit=1 (297) は埋め込みプレビュー用に全UIを隠すが、
//     こちらは「実際のUIが動いて見えること」自体が価値なので残す。
//   • 各章は既存ツールの公開関数（window.toggleMeasure / window.toggleSunMode /
//     window.toggleCamTool / window.addFigureLayer / window.toggleLayerPanelCollapse）
//     をそのまま呼ぶ。ユーザーがボタンを押したのと同じ経路を通る。
//   • 章は必ず try/catch で包む。失敗した章は黙って飛ばして次へ進む。
//   • ユーザー操作 (pointerdown / wheel / touchstart / keydown) で即中断し、
//     開いたツールを初期状態へ戻して操作を渡す。
//   • URL で明示されない限り完全に無効（通常利用へのオーバーヘッドはゼロ）。
//
//  シーン指定が無い ?showcase=1 単独ならデモシーンを自動読込する
//  （292 の ?demo=1 経路と同じ loadFromURL(DEMO_SCENE_URL) を使う）。
// ══════════════════════════════════════════════════
if(/[?&]showcase=1/.test(location.search)){
  (function(){
    // ── 文言（JA/EN）。250_i18n.js の辞書は本体UI用なので、ツアー専用文言は
    //    ここに閉じ込める。EN 切替時は現在表示中のチップを即座に描き直す。
    const TXT = {
      intro:   { ja:['ロケハン3D','機能ツアーを再生します'],
                 en:['LOCAHUN 3D','A quick tour of what this viewer does'] },
      orbit:   { ja:['① 見回す','ドラッグで自由に回り込めます'],
                 en:['1 — Look around','Drag to orbit the scan freely'] },
      measure: { ja:['② 計測','スキャン上の2点を実寸で測れます'],
                 en:['2 — Measure','Pick any two points for a real-world distance'] },
      sun:     { ja:['③ 日照','日付と時刻から太陽の位置を再現'],
                 en:['3 — Daylight','Real sun position from date, time and location'] },
      camtool: { ja:['④ カメラ','焦点距離とセーフフレームで画角を検討'],
                 en:['4 — Camera','Check the frame with real focal lengths'] },
      figure:  { ja:['⑤ フィギュア','人物を置いてスケール感を確認'],
                 en:['5 — Figure','Drop in a person to read the scale'] },
      layers:  { ja:['⑥ レイヤー','置いたものはレイヤーで管理'],
                 en:['6 — Layers','Everything you place is managed here'] },
      outro:   { ja:['ツアー終了','自由に操作してみてください'],
                 en:["That's the tour",'Now go ahead and explore'] },
      skip:    { ja:'スキップ ▸', en:'Skip ▸' },
    };
    const isEN = ()=> window._lang === 'en';
    const tx   = (k)=> (TXT[k] && (isEN() ? TXT[k].en : TXT[k].ja)) || ['',''];

    // ── キャプションチップ ──────────────────────────
    const chip = document.createElement('div');
    chip.id = 'sc-chip';
    chip.style.cssText =
      'position:fixed;left:50%;bottom:5.5%;transform:translateX(-50%) translateY(10px);z-index:6000;'+
      'display:flex;align-items:center;gap:18px;color:#fff;opacity:0;'+
      'transition:opacity .5s ease, transform .5s ease;pointer-events:none;'+
      'background:linear-gradient(180deg,rgba(0,0,0,.42),rgba(0,0,0,.62));'+
      'padding:11px 16px 11px 24px;border-radius:14px;border:1px solid rgba(255,255,255,.16);'+
      'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);'+
      'box-shadow:0 10px 34px rgba(0,0,0,.5);max-width:min(88vw,720px)';
    const body = document.createElement('div');
    body.style.cssText = 'flex:1;min-width:0;text-align:left';
    const main = document.createElement('div');
    main.style.cssText = 'font:700 clamp(15px,2.0vw,23px)/1.35 ui-sans-serif,system-ui,sans-serif;letter-spacing:.02em';
    const sub  = document.createElement('div');
    sub.style.cssText  = 'font:500 clamp(11px,1.3vw,15px)/1.4 ui-sans-serif,system-ui,sans-serif;opacity:.92;margin-top:3px;color:#ffd9a8';
    const step = document.createElement('div');
    step.style.cssText = 'font:600 11px/1 ui-sans-serif,system-ui,sans-serif;opacity:.5;letter-spacing:.12em;margin-bottom:5px';
    const skipBtn = document.createElement('button');
    skipBtn.id = 'sc-skip';
    skipBtn.type = 'button';
    skipBtn.style.cssText =
      'pointer-events:auto;flex:0 0 auto;cursor:pointer;white-space:nowrap;'+
      'background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.28);color:#fff;'+
      'border-radius:9px;padding:7px 13px;font:600 12px/1 ui-sans-serif,system-ui,sans-serif';
    body.appendChild(step); body.appendChild(main); body.appendChild(sub);
    chip.appendChild(body); chip.appendChild(skipBtn);
    document.body.appendChild(chip);

    let curKey = null, curIdx = 0;
    const CHAPTER_COUNT = 6;
    function paint(){
      const [m, s] = tx(curKey || 'intro');
      main.textContent = m; sub.textContent = s;
      step.textContent = curIdx > 0 ? (curIdx + ' / ' + CHAPTER_COUNT) : '';
      skipBtn.textContent = isEN() ? TXT.skip.en : TXT.skip.ja;
    }
    function say(key, idx){ curKey = key; if(idx !== undefined) curIdx = idx; paint(); }
    const fade = (on)=>{
      chip.style.opacity = on ? '1' : '0';
      chip.style.transform = 'translateX(-50%) translateY(' + (on ? '0' : '10px') + ')';
    };
    // EN切替に追従（showcase=1 のときだけ差し込む安全なラップ）。
    const _origToggleLang = window.toggleLang;
    if(typeof _origToggleLang === 'function'){
      window.toggleLang = function(){ _origToggleLang.apply(this, arguments); try{ paint(); }catch(_){} };
    }
    paint();

    // ── 中断 / 章スキップ ──────────────────────────
    let aborted = false;
    let skipToken = 0;          // 章スキップのたびに増える
    const waiters = new Set();
    function releaseWaits(){ for(const w of waiters){ clearTimeout(w.t); w.res(); } waiters.clear(); }
    function wait(ms){
      return new Promise(res=>{
        const w = { res };
        w.t = setTimeout(()=>{ waiters.delete(w); res(); }, ms);
        waiters.add(w);
      });
    }
    // 章の中断判定: 全体中断 or この章がスキップされた
    const chapterOver = (token)=> aborted || token !== skipToken;

    function abort(){
      if(aborted) return;
      aborted = true;
      releaseWaits();
      fade(false);
      setTimeout(()=>{ try{ chip.remove(); }catch(_){} }, 700);
      try{ restoreAll(); }catch(e){ console.warn('[showcase] restore failed', e); }
    }
    function onUserInput(ev){
      // 例外は2つだけ:
      //  • スキップボタン → 現在の章を打ち切って次章へ（ツアーは続く）
      //  • EN/JA 切替 → シーンを触る操作ではないので、言語を変えて見続けられる
      try{
        const t = ev && ev.target;
        if(t && t.closest && (t.closest('#sc-chip') || t.closest('#tb-lang-btn'))) return;
      }catch(_){}
      abort();
    }
    ['pointerdown','wheel','touchstart','keydown'].forEach(ev =>
      window.addEventListener(ev, onUserInput, { passive:true, capture:true }));
    skipBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      skipToken++;          // 現在の章を打ち切って次へ
      releaseWaits();
    });

    // ── 復帰用スナップショット ──────────────────────
    const snap = {
      camGrids: null, camFocal: null, camAspect: null, camWasActive: false,
      sunWasActive: false, sunTimeMin: null, envPreset: null,
      lpCollapsed: null,
      figureLayerId: null,
      // ツアー開始時のカメラ姿勢（＝シーンの既定＝いちばん見栄えのする画）。
      // 各章の頭でここへ戻すので、章ごとに構図が破綻しない。
      homePos: null, homeYaw: 0, homePitch: 0,
    };
    function captureHome(){
      snap.homePos = camPos.clone(); snap.homeYaw = yaw; snap.homePitch = pitch;
    }
    function goHome(){
      if(!snap.homePos) return;
      camPos.copy(snap.homePos);
      setCamRotImmediate(snap.homeYaw, snap.homePitch);
      if(typeof markDirty === 'function') markDirty(12);
    }
    // 日照は「空を凍結保持」する設計（050 _setEnvActive の else 分岐）なので、
    // OFF にするだけでは夕焼けが残る。時刻と環境プリセットまで戻して初めて
    // ツアー前の見え方に復帰する。
    function restoreSky(){
      if(typeof sun === 'undefined') return;
      if(snap.sunTimeMin != null){
        sun.timeMin = snap.sunTimeMin;
        if(typeof updateSunMode === 'function') updateSunMode();
        if(typeof _sunSyncForm === 'function') _sunSyncForm();
      }
      if(sun.active && !snap.sunWasActive && typeof window.toggleSunMode === 'function') window.toggleSunMode();
      if(snap.envPreset && typeof env !== 'undefined' && env.preset !== snap.envPreset &&
         typeof window.setEnvPreset === 'function'){
        window.setEnvPreset(snap.envPreset);
      }
    }
    function restoreAll(){
      // 周回停止
      orbitStop = true;
      // 計測 → 消して閉じる
      try{
        if(typeof msr !== 'undefined' && msr.active){
          if(typeof window.clearMeasure === 'function') window.clearMeasure();
          if(typeof window.toggleMeasure === 'function') window.toggleMeasure();
        }
      }catch(_){}
      // 日照 → 元の時刻・環境プリセットへ戻して閉じる
      try{ restoreSky(); }catch(_){}
      // カメラツール → 設定を戻して閉じる
      try{
        if(typeof cam !== 'undefined'){
          if(snap.camGrids)          cam.grids  = new Set(snap.camGrids);
          if(snap.camFocal  != null) cam.focal  = snap.camFocal;
          if(snap.camAspect !== null && snap.camAspect !== undefined) cam.aspect = snap.camAspect;
          if(cam.active && !snap.camWasActive && typeof window.toggleCamTool === 'function'){
            window.toggleCamTool();
          }
        }
      }catch(_){}
      // ツアーが置いたフィギュアを片付ける
      try{
        if(snap.figureLayerId != null && typeof window.removeLayer === 'function'){
          window.removeLayer(snap.figureLayerId);
          snap.figureLayerId = null;
        }
      }catch(_){}
      // レイヤーパネルの開閉を元へ
      try{
        const lp = document.getElementById('layer-panel');
        if(lp && snap.lpCollapsed !== null && lp.classList.contains('collapsed') !== snap.lpCollapsed){
          if(typeof window.toggleLayerPanelCollapse === 'function') window.toggleLayerPanelCollapse();
        }
      }catch(_){}
      if(typeof markDirty === 'function') markDirty(30);
    }

    // ── 幾何ヘルパー ────────────────────────────────
    const V3 = ()=> new THREE.Vector3();
    // 画面上の相対位置 (0..1) から実際のスキャン表面の点を拾う。
    // pickWorldPos は 090 の同一モジュールスコープ関数（測定の左クリックと同じ経路）。
    function pickAt(fx, fy){
      try{
        const r = canvas.getBoundingClientRect();
        return pickWorldPos(r.left + r.width * fx, r.top + r.height * fy);
      }catch(_){ return null; }
    }

    // ── 章1: 周回（その場で1周見回す）───────────────
    //  297 (?orbit=1) と同じ「yaw をゆっくり回す」ロジックを流用する。
    //  ピボットを取って周回させる案は、街路スキャンだと建物の内側を通って
    //  真っ白／真っ黒な画になったので採らない。その場で1周なら必ずスキャンの
    //  内側に留まり、始点＝終点なので次の章が既定の構図から始められる。
    let orbitStop = false;
    function panAround(sweepRad, durMs, token){
      return new Promise(resolve=>{
        const y0 = yaw, p0 = pitch;
        const t0 = performance.now();
        orbitStop = false;
        (function loop(now){
          if(orbitStop || chapterOver(token)) return resolve();
          const t = Math.min(1, (now - t0) / durMs);
          // ease-in-out で回り始め／止まり際を滑らかに
          const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
          setCamRotImmediate(y0 + sweepRad * e, p0);
          if(typeof markDirty === 'function') markDirty(2);
          if(t >= 1) return resolve();
          requestAnimationFrame(loop);
        })(performance.now());
      });
    }

    async function chOrbit(token){
      say('orbit', 1); fade(true);
      await wait(900); if(chapterOver(token)) return;
      await panAround(Math.PI * 2, 8200, token);
      if(chapterOver(token)) return;
      goHome();
      await wait(500);
    }

    // ── 章2: 計測 ───────────────────────────────────
    async function chMeasure(token){
      say('measure', 2);
      if(typeof window.toggleMeasure !== 'function') return;
      if(typeof msr !== 'undefined' && !msr.active) window.toggleMeasure();
      await wait(1000); if(chapterOver(token)) return;

      const a = pickAt(0.36, 0.66), b = pickAt(0.66, 0.62);
      if(!a || !b) return;

      // 点A（ユーザーの左クリック確定と同じ結果になるよう msr の状態を進める）
      msr.ptA.copy(a); msr.markerA.position.copy(a);
      msr.markerA.visible = true; msr.markerB.visible = false; msr.line.visible = false;
      msr.step = 1;
      if(typeof syncGizmoToMsr === 'function') syncGizmoToMsr();
      if(typeof updateMeasureStatuses === 'function') updateMeasureStatuses();
      if(typeof markDirty === 'function') markDirty(6);
      await wait(1500); if(chapterOver(token)) return;

      // 点B → 距離ラベル確定
      msr.ptB.copy(b); msr.markerB.position.copy(b);
      msr.markerB.visible = true; msr.line.visible = true;
      msr.step = 2;
      if(typeof updateMeasureLine === 'function') updateMeasureLine();
      if(typeof updateMeasureStatuses === 'function') updateMeasureStatuses();
      if(typeof syncGizmoToMsr === 'function') syncGizmoToMsr();
      if(typeof markDirty === 'function') markDirty(8);

      // 実測値をキャプションに出す（ここだけは動的なので paint() 後に上書き）
      const d = a.distanceTo(b);
      sub.textContent = (isEN() ? 'Distance between the two points: ' : '2点間の実測距離: ') + d.toFixed(2) + ' m';
      await wait(4200); if(chapterOver(token)) return;

      if(typeof window.clearMeasure === 'function') window.clearMeasure();
      if(msr.active) window.toggleMeasure();
      await wait(400);
    }

    // ── 章3: 日照 ───────────────────────────────────
    async function chSun(token){
      say('sun', 3);
      if(typeof sun === 'undefined' || typeof window.toggleSunMode !== 'function') return;
      snap.sunWasActive = !!sun.active;
      if(snap.sunTimeMin == null) snap.sunTimeMin = sun.timeMin;
      if(snap.envPreset == null && typeof env !== 'undefined') snap.envPreset = env.preset;
      if(!sun.active) window.toggleSunMode();
      await wait(900); if(chapterOver(token)) return;

      // 朝 6:00 → 夕 18:00 をスクラブ
      const FROM = 360, TO = 1080, DUR = 6600, TICK = 90;
      const t0 = performance.now();
      for(;;){
        if(chapterOver(token)) break;
        const t = Math.min(1, (performance.now() - t0) / DUR);
        sun.timeMin = Math.round((FROM + (TO - FROM) * t) / 10) * 10;
        if(typeof updateSunMode === 'function') updateSunMode();
        if(typeof _sunSyncForm === 'function') _sunSyncForm();
        const hh = String(Math.floor(sun.timeMin / 60)).padStart(2,'0');
        const mm = String(sun.timeMin % 60).padStart(2,'0');
        sub.textContent = (isEN() ? 'Time of day  ' : '時刻  ') + hh + ':' + mm;
        if(t >= 1) break;
        await wait(TICK);
      }
      if(chapterOver(token)) return;
      await wait(900);
      // 空・時刻・環境プリセットまで戻す（残しておくと以降の章が夕焼けのまま）
      restoreSky();
      await wait(300);
    }

    // ── 章4: カメラツール ───────────────────────────
    async function chCamTool(token){
      say('camtool', 4);
      if(typeof cam === 'undefined' || typeof window.toggleCamTool !== 'function') return;
      snap.camWasActive = !!cam.active;
      if(!snap.camGrids)         snap.camGrids  = Array.from(cam.grids || []);
      if(snap.camFocal  == null) snap.camFocal  = cam.focal;
      if(snap.camAspect === null) snap.camAspect = cam.aspect;
      if(!cam.active) window.toggleCamTool();
      await wait(800); if(chapterOver(token)) return;

      if(typeof window.setCamAspect === 'function') window.setCamAspect(16/9);
      await wait(400); if(chapterOver(token)) return;

      // 焦点距離 24mm → 85mm
      for(const mm of [24, 35, 50, 85]){
        if(chapterOver(token)) return;
        if(typeof window.setCamFocal === 'function') window.setCamFocal(mm);
        sub.textContent = (isEN() ? 'Focal length  ' : '焦点距離  ') + mm + 'mm';
        await wait(1500);
      }
      if(chapterOver(token)) return;

      // セーフフレーム表示（アクションセーフ + タイトルセーフ）
      if(typeof window.setCamGrid === 'function'){
        if(!cam.grids.has('safe-action')) window.setCamGrid('safe-action');
        if(!cam.grids.has('safe-title'))  window.setCamGrid('safe-title');
      }
      sub.textContent = isEN() ? 'Action-safe / title-safe frames' : 'セーフフレーム（アクション/タイトル）';
      await wait(2600); if(chapterOver(token)) return;

      if(cam.active && !snap.camWasActive) window.toggleCamTool();
      await wait(350);
    }

    // ── 章5: フィギュア ─────────────────────────────
    async function chFigure(token){
      say('figure', 5);
      if(typeof window.addFigureLayer !== 'function') return;
      // カメラの少し前・床(y=0)に立たせる
      const fwd = V3().set(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
      const spot = camPos.clone().addScaledVector(fwd, 3.2); spot.y = 0;
      const before = (typeof layers !== 'undefined') ? layers.map(l=>l.id) : [];
      await window.addFigureLayer(spot);
      if(typeof layers !== 'undefined'){
        const added = layers.find(l => l && l.type === 'figure' && before.indexOf(l.id) === -1);
        if(added) snap.figureLayerId = added.id;
      }
      if(typeof markDirty === 'function') markDirty(20);
      await wait(6500);
    }

    // ── 章6: レイヤーパネル ─────────────────────────
    async function chLayers(token){
      say('layers', 6);
      const lp = document.getElementById('layer-panel');
      if(!lp || typeof window.toggleLayerPanelCollapse !== 'function') return;
      if(snap.lpCollapsed === null) snap.lpCollapsed = lp.classList.contains('collapsed');
      if(lp.classList.contains('collapsed')) window.toggleLayerPanelCollapse();
      await wait(5200); if(chapterOver(token)) return;
      if(lp.classList.contains('collapsed') !== snap.lpCollapsed) window.toggleLayerPanelCollapse();
      await wait(400);
    }

    // ── 実行 ────────────────────────────────────────
    const hasScene = ()=> (typeof layers !== 'undefined' && layers.some(L=>L && L.mesh && L.type !== 'camera'));

    const CHAPTERS = [chOrbit, chMeasure, chSun, chCamTool, chFigure, chLayers];

    async function run(){
      // シーン指定が無ければデモシーンを自動読込
      try{
        const hasSrc = /[?&](autoload=|demo=1)/.test(location.search);
        if(!hasSrc && typeof DEMO_SCENE_URL !== 'undefined' && DEMO_SCENE_URL && typeof loadFromURL === 'function'){
          loadFromURL(DEMO_SCENE_URL,
            (typeof T === 'function' ? T('demo-btn-lbl') : DEMO_SCENE_LABEL));
        }
      }catch(e){ console.warn('[showcase] demo autoload failed', e); }

      // 読込完了待ち（357MB のデモは時間がかかる）
      for(let i=0; i<600 && !hasScene() && !aborted; i++) await wait(500);
      if(aborted || !hasScene()) return;
      await wait(2500);
      if(aborted) return;
      captureHome();

      // イントロ
      say('intro', 0); fade(true);
      await wait(3600);
      if(aborted) return;

      for(const ch of CHAPTERS){
        if(aborted) break;
        const token = skipToken;
        try {
          goHome();          // 章ごとに既定の構図から始める
          await ch(token);
        } catch(e){
          console.warn('[showcase] chapter skipped:', (e && e.message) || e);
        }
        if(aborted) break;
        // スキップされていなければ次章へ進む前にトークンを揃える
        if(token === skipToken) skipToken++;
        await wait(250);
      }
      if(aborted) return;

      // 締め — 全ツールを初期状態へ戻して操作を渡す
      try{ restoreAll(); }catch(_){}
      orbitStop = true;
      goHome();
      curIdx = 0; say('outro');
      skipBtn.style.display = 'none';   // もう飛ばす先が無い
      fade(true);
      await wait(6000);
      if(aborted) return;
      fade(false);
      setTimeout(()=>{ try{ chip.remove(); }catch(_){} }, 700);
    }
    setTimeout(run, 250);
  })();
}
