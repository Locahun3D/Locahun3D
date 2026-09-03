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
//
//   • ユーザーが操作してもツアーは中断しない（2026-08-27 本人FB
//     「操作すると中断しちゃうのよくない」）。触りながら見られるのが自然なので、
//     章は予定どおり最後まで進む。実際に競合するのは「カメラを誰が動かすか」
//     だけなので、ユーザー入力を検知したら *進行中の章のカメラ演出だけ* を譲る
//     （周回パンと構図リセット goHome を止める）。計測・日照・カメラツール・
//     フィギュア配置・パネル開閉といった中身はそのまま続行する。
//     明示的にやめる手段はチップの「✕ 終了」ただ一つ（restoreAll して片付ける）。
//
//   • キャプションチップは既存UIと重ねない（同FB「案内チップがUIにかぶる」）。
//     かつ、全章を通して *定位置* から動かさない（同FB「場所が変わりすぎてて
//     みずらい　酔う」）。この2つを両立させるため、ツアー中に開きうるパネルを
//     display:none のまま実測（visibility:hidden で display だけ戻す＝画面に
//     出ない）し、その“最悪ケース”の空き矩形から 1 か所を選んで固定する
//     （layoutChip / probeRects）。動かすのは画面サイズが変わった時だけ。
//     狭くて full の字組みが入らない幅では、位置を動かさずチップ側を
//     compact / tight / micro へ畳んで収める。
//
//   • キャプションは実際のボタン表記を DOM から引いて埋め込む（同FB「どこから
//     触るとどうなるのかわからない」）。UI 側の改名や EN 切替に自動追従する。
//
//   • 章のキャプションと動作は同時に始める（同FB「ずれててきもちわるい」）。
//     読込待ちがある章（フィギュア）は、出てからキャプションを切り替える。
//
//   • URL で明示されない限り完全に無効（通常利用へのオーバーヘッドはゼロ）。
//
//  シーン指定が無い ?showcase=1 単独ならデモシーンを自動読込する
//  （292 の ?demo=1 経路と同じ loadFromURL(DEMO_SCENE_URL) を使う）。
// ══════════════════════════════════════════════════
if(/[?&]showcase=1/.test(location.search)){
  (function(){
    // ── 文言（JA/EN）。250_i18n.js の辞書は本体UI用なので、ツアー専用文言は
    //    ここに閉じ込める。EN 切替時は現在表示中のチップを即座に描き直す。
    //  ── 画面に出ている実際のボタン表記をそのまま引く ──
    //  本人FB 2026-08-27「どこから触るとどうなるのかわからない」。文言に実UI名を
    //  ハードコードすると本体の改名でズレるので、DOM から取って一字一句一致させる
    //  （EN 切替にも自動で追従する）。
    function uiLabel(sel, fallback){
      try{
        const el = document.querySelector(sel);
        if(el){
          const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if(t) return t;
        }
      }catch(_){}
      return fallback;
    }
    function uiLabelParent(sel, fallback){
      try{
        const el = document.querySelector(sel);
        if(el && el.parentElement){
          const t = (el.parentElement.textContent || '').replace(/\s+/g, ' ').trim();
          if(t) return t;
        }
      }catch(_){}
      return uiLabel(sel, fallback);
    }
    //  ── 端末ごとに「その機能が存在するか」を実DOMで見る ──
    //  本人FB 2026-08-27「端末ごとに機能が違うのを対応できていない」。
    //  メディアクエリを二重管理せず、本体UIが実際に出しているかどうかで判定する。
    //    スマホ(≤600px・pointer:coarse): シーンレイヤーパネルが display:none →
    //      レイヤーの章と、その見出しにある📦オブジェクト追加からのフィギュアの章は
    //      「そもそも触れない」ので飛ばす。移動はジョイスティック。
    //    タブレット(iPad): パネルもボタンも出る＝PCと同じ章立て。移動はジョイスティック。
    //    PC: ジョイスティック非表示＝移動は W/A/S/D、見回しはドラッグ。
    function isVis(sel, ignoreOpacity){
      try{
        const el = document.querySelector(sel);
        if(!el) return false;
        const cs = getComputedStyle(el);
        if(cs.display === 'none' || cs.visibility === 'hidden') return false;
        if(!ignoreOpacity && parseFloat(cs.opacity || '1') < 0.05) return false;
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      }catch(_){ return false; }
    }
    const HAS = {
      joystick: ()=> isVis('#joy'),
      elevPad:  ()=> isVis('#joy-vert'),
      measure:  ()=> isVis('#btnMeasure'),
      sun:      ()=> isVis('#btn-sun'),
      cam:      ()=> isVis('#btnCamTool'),
      // 📦モデル追加はシーンレイヤーを *展開したとき* だけ見える行にある。
      // 畳んでいる間は非表示なので「存在するか」はパネル自体の有無で見る。
      addObj:   ()=> isVis('#layer-panel', true) && !!document.getElementById('btnAddCubeTop'),
      layers:   ()=> isVis('#layer-panel', true),
    };
    const UI = {
      measure: ()=> uiLabel('#btnMeasure',      '📐 測定'),
      sun:     ()=> uiLabel('#btn-sun',         '☀ 日照'),
      cam:     ()=> uiLabel('#btnCamTool',      '📷 カメラ'),
      addObj:  ()=> uiLabel('#btnAddCubeTop',   '📦 オブジェクト追加 ▾'),
      figure:  ()=> uiLabelParent('#lbl-addfig-top', '👤 フィギュア (人型リグ)'),
      layers:  ()=> uiLabel('#lp-h-scene',      'シーンレイヤー'),
      wx:      (k)=> uiLabel('#sun-wx-' + k,    k),
    };
    const B = (s)=> '【' + s + '】';

    const TXT = {
      intro:   ()=> isEN() ? ['LOCAHUN 3D', 'A quick tour of what this viewer does']
                           : ['ロケハン3D', '機能ツアーを再生します'],
      orbit:   ()=>{
        // 案内する操作名は「その端末に実在する操作」だけにする。
        if(HAS.joystick()){
          const up = HAS.elevPad() ? (isEN() ? ' (▲▼ for height)' : '（▲▼で上下）') : '';
          return isEN() ? ['Look around', 'Swipe to look around, and move with the on-screen joystick' + up]
                        : ['見回す',      'スワイプで見回し、ジョイスティックで移動できます' + up];
        }
        return isEN() ? ['Look around', 'Drag to look around, and move with W / A / S / D']
                      : ['見回す',      'ドラッグで見回し、W / A / S / D で移動できます'];
      },
      measure: ()=> isEN() ? ['Measure',
                              'Press ' + B(UI.measure()) + ' in the bottom bar, then click two points']
                           : ['計測',
                              '下部ツールバーの' + B(UI.measure()) + 'を押して2点をクリックすると実寸が出ます'],
      sun:     ()=> isEN() ? ['Daylight',
                              'Press ' + B(UI.sun()) + ' to set the date, time and weather']
                           : ['日照',
                              '下部ツールバーの' + B(UI.sun()) + 'で日付・時刻・天気を設定できます'],
      camtool: ()=> isEN() ? ['Camera',
                              'Press ' + B(UI.cam()) + ' to check the frame with real focal lengths']
                           : ['カメラ',
                              '下部ツールバーの' + B(UI.cam()) + 'で焦点距離とセーフフレームを検討できます'],
      figure:  ()=> isEN() ? ['Figure',
                              B(UI.addObj()) + ' → ' + B(UI.figure()) + ' places a person for scale']
                           : ['フィギュア',
                              B(UI.addObj()) + '→' + B(UI.figure()) + 'で人物を置いてスケールを確認できます'],
      layers:  ()=> isEN() ? ['Layers',
                              'Everything you place is listed in the ' + B(UI.layers()) + ' panel on the left']
                           : ['レイヤー',
                              '置いたものは左の' + B(UI.layers()) + 'パネルにまとまります'],
      outro:   ()=> isEN() ? ["That's the tour", 'Now go ahead and explore']
                           : ['ツアー終了', '自由に操作してみてください'],
    };
    const BTNTXT = {
      skip: { ja:'スキップ ▸', en:'Skip ▸' },
      end:  { ja:'✕ 終了',    en:'✕ End'  },
    };
    const isEN = ()=> window._lang === 'en';
    const tx   = (k)=> (TXT[k] ? TXT[k]() : ['','']);

    // ── キャプションチップ ──────────────────────────
    //  位置・幅・字組みは layoutChip() が起動時（とリサイズ時）に実測で決める。CSS の固定オフセットは
    //  モバイルで .cbar が bottom:212px まで跳ね上がる等の分岐に追従できないので
    //  一切使わない（ここに書くのは見た目の素材だけ）。
    const chip = document.createElement('div');
    chip.id = 'sc-chip';
    chip.style.cssText =
      'position:fixed;left:50%;bottom:80px;transform:translateX(-50%) translateY(10px);z-index:6000;'+
      'display:flex;align-items:center;flex-wrap:wrap;gap:12px 16px;color:#fff;opacity:0;'+
      'transition:opacity .5s ease, transform .5s ease, left .45s ease, bottom .45s ease;pointer-events:none;'+
      'background:linear-gradient(180deg,rgba(0,0,0,.42),rgba(0,0,0,.62));'+
      'padding:11px 16px 11px 20px;border-radius:14px;border:1px solid rgba(255,255,255,.16);'+
      'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);'+
      'box-shadow:0 10px 34px rgba(0,0,0,.5);box-sizing:border-box;max-width:720px';
    const body = document.createElement('div');
    body.style.cssText = 'flex:1 1 140px;min-width:0;text-align:left';
    const main = document.createElement('div');
    main.style.cssText = 'letter-spacing:.02em;overflow-wrap:anywhere';
    const sub  = document.createElement('div');
    sub.style.cssText  = 'opacity:.92;margin-top:3px;color:#ffd9a8;overflow-wrap:anywhere';
    const step = document.createElement('div');
    step.style.cssText = 'font:600 11px/1 ui-sans-serif,system-ui,sans-serif;opacity:.5;letter-spacing:.12em;margin-bottom:5px';

    // アクション: 「スキップ ▸」= 章送り / 「✕ 終了」= ツアー自体をやめる。
    const acts = document.createElement('div');
    acts.style.cssText = 'flex:0 0 auto;margin-left:auto;display:flex;align-items:center;gap:8px';
    const mkBtn = (id, extra)=>{
      const b = document.createElement('button');
      b.id = id; b.type = 'button';
      b.style.cssText =
        'pointer-events:auto;flex:0 0 auto;cursor:pointer;white-space:nowrap;'+
        'background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.28);color:#fff;'+
        'border-radius:9px;padding:7px 13px;font:600 12px/1 ui-sans-serif,system-ui,sans-serif;'+
        'transition:background .15s,border-color .15s;' + (extra || '');
      return b;
    };
    const skipBtn = mkBtn('sc-skip');
    const endBtn  = mkBtn('sc-end',
      'background:rgba(255,120,110,.14);border-color:rgba(255,140,130,.42);color:#ffd9d5');
    acts.appendChild(skipBtn); acts.appendChild(endBtn);
    body.appendChild(step); body.appendChild(main); body.appendChild(sub);
    chip.appendChild(body); chip.appendChild(acts);
    document.body.appendChild(chip);

    // ── 表示密度モード ─────────────────────────────
    //  置ける空きが狭いほど下のモードへ落とす。狭幅でレイヤーパネルが全高を
    //  占めて「余白が無い」状況（本人指摘）は、重ねて誤魔化すのではなく
    //  チップ自身を小さく畳んで“空いている所へ入る”ことで解く。
    //  micro は縦積み＋アイコンボタンで、幅 120px 前後の隙間にも収まる。
    const FF = ' ui-sans-serif,system-ui,sans-serif';
    const MODES = [
      { k:'full',    step:1, sub:1, icons:0, col:0,
        mainF:'700 22px/1.35', subF:'500 14px/1.45',
        pad:'11px 16px 11px 20px', gap:'12px 16px', btn:'7px 13px', btnF:'600 12px/1' },
      { k:'compact', step:1, sub:1, icons:0, col:0,
        mainF:'700 17px/1.3',  subF:'500 12.5px/1.4',
        pad:'9px 12px 9px 14px', gap:'8px 12px', btn:'6px 11px', btnF:'600 11.5px/1' },
      { k:'tight',   step:0, sub:1, icons:1, col:0,
        mainF:'700 14px/1.3',  subF:'500 11.5px/1.35',
        pad:'7px 9px', gap:'6px 8px', btn:'5px 8px', btnF:'600 12px/1' },
      // micro でも説明文(sub)は残す。スマホではカメラパネルが右 210px を
      // 占めるので幅 150px 前後しか空かないが、そこで説明を落とすと
      // 「読める」を満たせない。幅は空きいっぱいに広げ、行数で受ける。
      { k:'micro',   step:0, sub:1, icons:1, col:1,
        mainF:'700 12.5px/1.35', subF:'500 11px/1.45',
        pad:'6px 8px', gap:'5px', btn:'4px 7px', btnF:'600 12px/1' },
    ];
    let curIcons = 0, modeKey = null;
    function paintBtnLabels(){
      const sTxt = isEN() ? BTNTXT.skip.en : BTNTXT.skip.ja;
      const eTxt = isEN() ? BTNTXT.end.en  : BTNTXT.end.ja;
      skipBtn.textContent = curIcons ? '▸' : sTxt;
      endBtn.textContent  = curIcons ? '✕' : eTxt;
      skipBtn.title = sTxt; endBtn.title = eTxt;
      skipBtn.setAttribute('aria-label', sTxt);
      endBtn.setAttribute('aria-label', eTxt);
    }
    function applyMode(m){
      if(modeKey === m.k) return;
      modeKey = m.k; curIcons = m.icons;
      chip.style.flexDirection = m.col ? 'column' : 'row';
      chip.style.alignItems    = m.col ? 'stretch' : 'center';
      chip.style.padding       = m.pad;
      chip.style.gap           = m.gap;
      chip.style.borderRadius  = m.col ? '11px' : '14px';
      body.style.flex   = m.col ? '1 1 auto' : '1 1 140px';
      step.style.display = m.step ? 'block' : 'none';
      sub.style.display  = m.sub  ? 'block' : 'none';
      main.style.font    = m.mainF + FF;
      sub.style.font     = m.subF  + FF;
      acts.style.marginLeft     = m.col ? '0' : 'auto';
      acts.style.justifyContent = m.col ? 'flex-end' : 'flex-start';
      for(const b of [skipBtn, endBtn]){ b.style.padding = m.btn; b.style.font = m.btnF + FF; }
      paintBtnLabels();
    }

    let curKey = null, curIdx = 0;
    //  章数は端末で変わる（スマホはレイヤー／フィギュアが無い）ので run() で確定する。
    let CHAPTER_COUNT = 6;
    const CIRCLED = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨'];
    function paint(){
      const [m, s] = tx(curKey || 'intro');
      main.textContent = (curIdx > 0 ? (CIRCLED[curIdx - 1] || curIdx) + ' ' : '') + m;
      sub.textContent = s;
      step.textContent = curIdx > 0 ? (curIdx + ' / ' + CHAPTER_COUNT) : '';
      paintBtnLabels();
      // ★ここで位置を計算し直さない。チップは全章を通して定位置（本人FB）。
    }
    function say(key, idx){ curKey = key; if(idx !== undefined) curIdx = idx; paint(); }
    const fade = (on)=>{
      chip.style.opacity = on ? '1' : '0';
      chip.style.transform = 'translateX(-50%) translateY(' + (on ? '0' : '10px') + ')';
    };

    // ── チップの当たり判定回避レイアウト ────────────
    //  「かぶらない位置」を CSS の決め打ちではなく実測で出す。対象は本人が挙げた
    //  上部バー・下部バー・レイヤーパネル・開いた各パネルの全部。
    //  pointer-events:none の全画面オーバーレイ（#cam-hud のセーフフレーム、
    //  環境ティント等）は「UI」ではないので除外する — これらは inset:0 なので
    //  障害物に数えると回避先が存在しなくなる。
    const OBSTACLES = [
      '#topbar', '#view-tl-btns', '#qi-badge', '#immersive-exit',
      '#hud > *',                                  // .cbar / .ibox など（装飾は下で除外）
      '#joy', '#joy-vert',
      '#layer-panel', '#lp-footer-bar', '#lp-divider', '#layer-transform',
      '#sun-panel', '#cam-panel', '#cam-shot-panel', '#cam-anim-panel',
      '#gizmo', '#quality-panel', '#helpbox', '#msr-hint', '#onote', '#undo-toast',
      '.guide-banner',
    ];
    //  「いま開いているUI」ではなく「ツアー中に開きうるUI全部」を避けたいので、
    //  display:none のパネルも *見えないまま* 実測する（visibility:hidden の
    //  まま display を戻して測り、すぐ元へ返す＝画面には一切出ない）。
    //  これで、章ごとにチップを動かさずに済む定位置が求まる。
    //  列挙するのは「ツアーが実際に開くもの」だけ。画質パネルやカメラワーク
    //  パネルまで足すと空きが痩せすぎて、チップが画面の真ん中に浮く結果になる。
    //  （それらはツアー中に開かない。ユーザーが自分で開いた場合は、そのとき
    //   前面に出るのはそちらで良い。）
    //  その章が「この端末で実際に走るか」も条件にする。走らない章のパネルまで
    //  場所を予約すると、空きが痩せてチップが隅に押しやられる。例: スマホは
    //  シーンレイヤーが display:none で章6ごと飛ばすのに、そのパネル3枚ぶんの
    //  面積を避けていた（user 2026-08-14）。null は「常に予約」。
    const PROBE = [
      ['#sun-panel',       ()=>HAS.sun()],      // 章3
      ['#cam-panel',       ()=>HAS.cam()],      // 章4
      ['#gizmo',           ()=>HAS.measure()],  // 章2（測定パネル）
      ['#layer-transform', ()=>HAS.layers()],   // 章6（レイヤー展開）
      ['#lp-footer-bar',   ()=>HAS.layers()],
      ['#lp-divider',      ()=>HAS.layers()],
      ['#joy',             null],
      ['#joy-vert',        null],
    ];
    //  中央寄せで幅が変わる横帯は、幅いっぱいを予約する（下の理由参照）。
    const WIDEN = ['#hud > *', '#view-tl-btns'];
    const GAP = 10;      // チップと UI のあいだに残す余白(px)
    const PAD = 8;       // 画面端に残す余白(px)
    function probeRects(){
      const out = [];
      for(const entry of PROBE){
        const sel = entry[0], when = entry[1];
        // この端末で走らない章のパネルは場所を空けておく必要がない
        if(when){ let ok = true; try{ ok = !!when(); }catch(_){ ok = true; } if(!ok) continue; }
        let els;
        try{ els = document.querySelectorAll(sel); }catch(_){ continue; }
        for(const el of els){
          let cs;
          try{ cs = getComputedStyle(el); }catch(_){ continue; }
          if(cs.display !== 'none') continue;          // 開いていれば通常の計測で拾える
          const pd = el.style.display, pv = el.style.visibility;
          el.style.visibility = 'hidden';
          el.style.display = 'block';
          // 開くときに JS で置き直されるパネルは、その置き直しを先に適用して
          // から測る（#sun-panel は開くたび _sunUpdatePanelPos() で
          // 「レイヤーパネルの右隣」へ動く＝CSS 既定位置とは別物）。
          try{ if(sel === '#sun-panel' && typeof _sunUpdatePanelPos === 'function') _sunUpdatePanelPos(); }catch(_){}
          const r = el.getBoundingClientRect();
          el.style.display = pd; el.style.visibility = pv;
          if(r.width < 2 || r.height < 2) continue;
          if(r.width * r.height > innerWidth * innerHeight * 0.7) continue;
          // 画面外に置かれている（未初期化）ものは無視
          if(r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
          out.push(r);
        }
      }
      return out;
    }
    //  レイヤーパネルは章6で展開されて「左端・全高」になる。畳んだ状態のまま
    //  測ると、その下を空きだと誤認して章6でチップに被る。常に全高ぶん予約する。
    function layerPanelFullRect(){
      const el = document.getElementById('layer-panel');
      if(!el) return [];
      let cs;
      try{ cs = getComputedStyle(el); }catch(_){ return []; }
      if(cs.display === 'none' || cs.visibility === 'hidden') return [];
      const r = el.getBoundingClientRect();
      if(r.width < 2 || r.right <= 0 || r.left >= innerWidth) return [];
      return [{ left:r.left, top:r.top, right:r.right, bottom:innerHeight }];
    }
    function obstacleRects(){
      const out = [];
      for(const sel of OBSTACLES){
        let els;
        try{ els = document.querySelectorAll(sel); }catch(_){ continue; }
        for(const el of els){
          if(!el || el === chip || chip.contains(el) || el.contains(chip)) continue;
          let cs;
          try{ cs = getComputedStyle(el); }catch(_){ continue; }
          if(cs.display === 'none' || cs.visibility === 'hidden') continue;
          if(parseFloat(cs.opacity || '1') < 0.05) continue;
          if(cs.pointerEvents === 'none') continue;   // 装飾オーバーレイ
          // 祖先ごと隠れている場合も除外。ただし *opacity* は見ない：#hud は
          // ツアー中に一時的に opacity:0 へフェードすることがあり、その瞬間に
          // 測ると .cbar ごと「存在しない」ことになって、チップが下部バーに
          // 重なる位置で固定されてしまう（user 2026-08-14 実測）。ボタン自体は
          // 消えていないので、幾何としては障害物のまま扱う。要素自身の
          // opacity:0（トースト類）は上の行で除外済み。
          if(typeof el.checkVisibility === 'function' &&
             !el.checkVisibility({ visibilityProperty:true, contentVisibilityAuto:true })) continue;
          const r = el.getBoundingClientRect();
          if(r.width < 2 || r.height < 2) continue;
          if(r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
          // 画面をほぼ覆う要素は「UI部品」ではなく背景／オーバーレイ。障害物に
          // 数えると逃げ場が消えるので除外する。
          if(r.width * r.height > innerWidth * innerHeight * 0.7) continue;
          // 中央寄せの横長バーは、モードによって見えるボタンが増減して幅も
          // 中心もズレる（例: スマホの日照/カメラ中は .cbar が 1 ボタンになって
          // 左へ寄る）。位置を固定する以上、その帯は幅いっぱい予約しておく。
          if(WIDEN.indexOf(sel) >= 0){
            out.push({ left:0, top:r.top, right:innerWidth, bottom:r.bottom,
                       width:innerWidth, height:r.height });
            continue;
          }
          out.push(r);
        }
      }
      return out;
    }
    const hits = (a, b)=> !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);

    //  空き矩形の列挙。障害物を GAP ぶん膨らませておき、その左右端を x の
    //  切れ目の候補にする。各 x 帯について「その帯を塞ぐ障害物の y 区間」を
    //  抜いた残りが、その帯で縦に最大の空き矩形になる。障害物は 10〜20 個
    //  程度なので総当たりで足りる（1 回 1ms 未満）。
    function freeRects(obs, vw, vh){
      const xs = [PAD, vw - PAD];
      for(const o of obs){
        if(o.left  > PAD && o.left  < vw - PAD) xs.push(o.left);
        if(o.right > PAD && o.right < vw - PAD) xs.push(o.right);
      }
      xs.sort((a,b)=>a-b);
      const X = xs.filter((v,i)=> i === 0 || v - xs[i-1] > 1);
      const out = [];
      for(let i = 0; i < X.length - 1; i++){
        for(let j = i + 1; j < X.length; j++){
          const x1 = X[i], x2 = X[j];
          if(x2 - x1 < 96) continue;
          const bars = [];
          for(const o of obs) if(o.right > x1 && o.left < x2) bars.push(o);
          bars.sort((a,b)=> a.top - b.top);
          let y = PAD;
          for(const b of bars){
            if(b.top > y) out.push([x1, x2, y, Math.min(b.top, vh - PAD)]);
            if(b.bottom > y) y = b.bottom;
            if(y >= vh - PAD) break;
          }
          if(y < vh - PAD) out.push([x1, x2, y, vh - PAD]);
        }
      }
      return out.filter(c => c[3] - c[2] >= 40 && c[2] >= PAD - 0.5);
    }

    //  置き場所の好み。下寄り・中央寄り・広いほど良い。「読める」を優先して
    //  full/compact が入る幅には強めのボーナスを付ける。
    //  「中央」の基準は *キャンバスの中央*（左のシーンレイヤーパネルを除いた
    //  表示領域の中心）。下部ツールバーもこの基準に揃えたので合わせる
    //  （user 2026-08-27）。パネルが無い端末ではビューポート中央と同じ。
    function canvasCenterX(vw){
      const lp = document.getElementById('layer-panel');
      let left = 0;
      try{
        if(lp && getComputedStyle(lp).display !== 'none' && lp.classList.contains('visible')){
          const r = lp.getBoundingClientRect();
          if(r.width > 4 && r.left <= 0) left = r.right;
        }
      }catch(_){}
      return (left + vw) / 2;
    }
    function scoreRect(c, vw, vh){
      const w = c[1] - c[0], h = c[3] - c[2];
      const cx = (c[0] + c[1]) / 2;
      const c0 = canvasCenterX(vw);
      const span = Math.max(1, vw - c0);
      let s = 0;
      s += (w >= 440 ? 260 : w >= 300 ? 170 : w >= 190 ? 80 : 0);
      s += Math.min(w, 640) / 640 * 90;
      s += (c[3] / vh) * 70;                                   // 下にあるほど良い
      s += (1 - Math.min(1, Math.abs(cx - c0) / span)) * 45;   // キャンバス中央寄り
      s += Math.min(h, 220) / 220 * 15;
      return s;
    }

    //  定位置は「全章ぶんの文言のうち一番背が高くなるもの」が収まる場所でないと
    //  いけない。章が進んで文が伸びたときに動かせない（動かすと酔う）ため、
    //  最初から最大の高さで場所を選ぶ。JA/EN 両方＋章番号ありで測る。
    const _CAP_KEYS = ['intro','orbit','measure','sun','camtool','figure','layers','outro'];
    const _hCache = new Map();
    function maxCaptionHeight(ww){
      const key = modeKey + '|' + ww;
      if(_hCache.has(key)) return _hCache.get(key);
      const sm = main.textContent, ss = sub.textContent, sp = step.textContent, sl = window._lang;
      let maxH = 0;
      for(const lang of ['ja', 'en']){
        window._lang = lang;
        paintBtnLabels();
        for(const k of _CAP_KEYS){
          const t = tx(k);
          main.textContent = t[0]; sub.textContent = t[1]; step.textContent = '6 / 6';
          const hh = chip.getBoundingClientRect().height;
          if(hh > maxH) maxH = hh;
        }
      }
      window._lang = sl;
      main.textContent = sm; sub.textContent = ss; step.textContent = sp;
      paintBtnLabels();
      maxH += 10;                     // 実測距離や時刻など動的な差しこみぶんの余白
      _hCache.set(key, maxH);
      return maxH;
    }

    let _lastPick = null;   // 検証用（どの空きを選んだか）
    function place(c, obs, vh){
      const w = c[1] - c[0], h = c[3] - c[2];
      let mi = w >= 440 ? 0 : w >= 300 ? 1 : w >= 190 ? 2 : 3;
      for(; mi < MODES.length; mi++){
        applyMode(MODES[mi]);
        // 幅は「空きいっぱい」に固定する。縮めて成り行きにすると、狭い端末で
        // 文字が細長い柱になって読めない。高さ（行数）で受けるほうが読める。
        const ww = Math.min(w, 720);
        chip.style.width    = ww + 'px';
        chip.style.maxWidth = ww + 'px';
        chip.style.left     = Math.round((c[0] + c[1]) / 2) + 'px';
        chip.style.bottom   = Math.round(vh - c[3]) + 'px';
        const needH = maxCaptionHeight(ww);
        if(needH > h + 0.5) continue;
        // 一番背が高い文言の状態で当たり判定する（＝どの章でも当たらない）。
        const cr = chip.getBoundingClientRect();
        const probe = { left:cr.left, right:cr.right, bottom:cr.bottom, top:cr.bottom - needH };
        if(probe.right - probe.left > w + 0.5) continue;
        let bad = false;
        for(const o of obs){ if(hits(probe, o)){ bad = true; break; } }
        if(!bad) return true;
      }
      return false;
    }

    //  ── 定位置（ドック）を 1 回だけ決める ────────────
    //  本人FB 2026-08-27「ポップアップUIの場所が変わりすぎててみずらい　酔う」。
    //  章やパネル開閉でチップを動かすのは禁止。ツアー中に開きうるUIを全部
    //  足し合わせた“最悪ケース”の空きから 1 か所を選び、以後そこに固定する。
    //  動かすのは画面サイズが変わった時だけ。
    //  opts.ignoreProbes: 「いま開いているUI」だけを避ける（＝これから開くかも
    //  しれないパネルは無視）。狭い端末で中央に寄せるための FREE ドック計算用。
    function layoutChip(opts){
      const useProbes = !(opts && opts.ignoreProbes);
      const vw = innerWidth, vh = innerHeight;
      if(!vw || !vh) return;
      const inflate = (list)=> list.map(r=>({
        left: r.left - GAP, top: r.top - GAP, right: r.right + GAP, bottom: r.bottom + GAP,
      }));
      const visible = obstacleRects();
      // 段階的に妥協する。①開きうるUI全部を避ける ②パネル類は諦めて常設UI＋
      // レイヤーパネル全高だけ避ける ③常設UIだけ避ける。極端に低い/狭い
      // ビューポート（パネル自身が画面を超える）でも、最低限バーには被らない。
      const LEVELS = useProbes ? [
        inflate(visible.concat(probeRects()).concat(layerPanelFullRect())),
        inflate(visible.concat(layerPanelFullRect())),
        inflate(visible),
      ] : [
        inflate(visible),
      ];

      // フェード用の translateY(10px) が入ったまま測ると 10px ぶんズレるので、
      // 測定中だけ「表示位置」の transform に固定する（同一フレーム内なので
      // ちらつかない）。
      // ★transition を切ってから transform を書くこと。つけたまま書くと
      //   getBoundingClientRect が *アニメーション途中* の座標を返し、まだ
      //   10px 下にいる状態で当たり判定してしまう（＝広い空きが全部「当たる」
      //   と誤判定され、狭い場所に小さく置かれる）。2026-08-27 の実測で判明。
      const prevTr = chip.style.transform;
      const prevTs = chip.style.transition;
      chip.style.transition = 'none';
      chip.style.transform = 'translateX(-50%) translateY(0)';
      try{
        _hCache.clear();
        let cands = [];
        // ① まず「ビューポートのど真ん中」に置けるか試す。②の空き探索は空きの
        //    中央に寄せるので、左のレイヤーパネルぶんだけ常に右へ寄り「中心から
        //    ずれている」と見えていた — user 2026-08-14。中央に置いてもどの障害物
        //    にも当たらないなら中央を優先し、当たる狭い端末だけ②へ落とす。
        //    ここも「一度決めたら動かさない」原則は維持（最悪ケースの LEVELS[0]
        //    で判定しているので、ツアー中にパネルが開いても動かす必要がない）。
        {
          const cx = vw / 2;
          const centred = freeRects(LEVELS[0], vw, vh)
            .filter(c => c[0] < cx && c[1] > cx)
            .map(c => {
              const half = Math.min(c[1] - cx, cx - c[0]);
              return [cx - half, cx + half, c[2], c[3]];
            })
            // 中央に寄せた結果が細すぎる（compact も入らない）なら、中央より
            // 「読めること」を優先して②の空き探索に任せる。中央の細い柱に
            // 押し込むと文字が縦に伸びて逆に読めない。
            .filter(c => c[1] - c[0] >= 300)
            .sort((a, b) => scoreRect(b, vw, vh) - scoreRect(a, vw, vh));
          for(let i = 0; i < centred.length && i < 8; i++){
            if(place(centred[i], LEVELS[0], vh)){
              _lastPick = { lv:'centred', i, c: centred[i].slice(), mode: modeKey, n: centred.length };
              return;
            }
          }
        }
        for(let lv = 0; lv < LEVELS.length; lv++){
          const obs = LEVELS[lv];
          cands = freeRects(obs, vw, vh);
          cands.sort((a,b)=> scoreRect(b, vw, vh) - scoreRect(a, vw, vh));
          for(let i = 0; i < cands.length && i < 16; i++){
            if(place(cands[i], obs, vh)){
              _lastPick = { lv, i, c: cands[i].slice(), mode: modeKey, n: cands.length };
              return;
            }
          }
        }
        _lastPick = { lv:-1, i:-1, n: cands.length };
        // どこにも収まらない（UI が画面を埋め尽くしている）— いちばんマシな
        // 空きへ最小モードで入れる。空きが 1 つも無ければ従来どおり下中央。
        applyMode(MODES[MODES.length - 1]);
        const c = cands[0];
        if(c){
          const ww = Math.max(96, Math.min(c[1] - c[0], 720));
          chip.style.width = chip.style.maxWidth = ww + 'px';
          chip.style.left     = Math.round((c[0] + c[1]) / 2) + 'px';
          chip.style.bottom   = Math.round(vh - c[3]) + 'px';
        } else {
          const ww = Math.round(vw * 0.86);
          chip.style.width = chip.style.maxWidth = ww + 'px';
          chip.style.left = Math.round(vw / 2) + 'px';
          chip.style.bottom = '14px';
        }
      } finally {
        chip.style.transform = prevTr;
        void chip.offsetWidth;              // 戻しを確定させてから transition を復帰
        chip.style.transition = prevTs;
      }
    }

    //  ── ドック2つ持ち（狭い端末で「普段は中央」を成立させる）──────
    //  スマホでは #cam-panel が画面右半分を全高で覆うため、「開きうるUIを全部
    //  避ける」1点固定だと中央に置けず、常に左端へ寄ってしまう（実測 -97px）。
    //  本人判断 2026-08-14「どうしても無理なら少しずらしてもいい」を受けて、
    //    FREE = いま見えているUIだけ避けた位置（＝中央寄り。普段はこちら）
    //    SAFE = 開きうるUIも全部避けた位置（＝従来の1点固定）
    //  の2つを持ち、パネルが *実際に開いて* FREE と重なる間だけ SAFE へ退避する。
    //  章ごとに動くわけではないので「場所が変わりすぎて酔う」には戻らない。
    //  PC/タブレットは FREE と SAFE が一致する（中央で当たらない）ので不動。
    let DOCK_FREE = null, DOCK_SAFE = null, dockNow = '';
    function captureDock(){
      const r = chip.getBoundingClientRect();
      return { left: chip.style.left, bottom: chip.style.bottom,
               width: chip.style.width, maxWidth: chip.style.maxWidth, mode: modeKey,
               rect: { left:r.left, top:r.top, right:r.right, bottom:r.bottom } };
    }
    function applyDock(d){
      if(!d) return;
      const m = MODES.find(x => x.k === d.mode);
      if(m) applyMode(m);
      chip.style.width = d.width; chip.style.maxWidth = d.maxWidth;
      chip.style.left  = d.left;  chip.style.bottom   = d.bottom;
    }
    const sameDock = (a, b)=> !!a && !!b && a.left === b.left && a.bottom === b.bottom &&
                              a.width === b.width && a.mode === b.mode;
    function computeDocks(){
      layoutChip();                            // 最悪ケース回避＝SAFE
      DOCK_SAFE = captureDock();
      layoutChip({ ignoreProbes:true });       // いま見えているUIだけ回避＝FREE
      DOCK_FREE = captureDock();
      applyDock(DOCK_FREE); dockNow = 'free';
    }
    //  FREE の位置に、いま実際に開いているパネルが被っているか
    function probeCoversFree(){
      if(!DOCK_FREE || sameDock(DOCK_FREE, DOCK_SAFE)) return false;
      const f = DOCK_FREE.rect;
      for(const entry of PROBE){
        const el = document.querySelector(entry[0]);
        if(!el) continue;
        let cs; try{ cs = getComputedStyle(el); }catch(_){ continue; }
        if(cs.display === 'none' || cs.visibility === 'hidden') continue;
        if(parseFloat(cs.opacity || '1') < 0.05) continue;
        const r = el.getBoundingClientRect();
        if(r.width < 2 || r.height < 2) continue;
        if(!(r.right <= f.left - GAP || r.left >= f.right + GAP ||
             r.bottom <= f.top - GAP || r.top >= f.bottom + GAP)) return true;
      }
      return false;
    }
    function syncDock(){
      if(!DOCK_FREE || sameDock(DOCK_FREE, DOCK_SAFE)) return;   // 動く必要なし
      const want = probeCoversFree() ? 'safe' : 'free';
      if(want === dockNow) return;
      dockNow = want;
      applyDock(want === 'safe' ? DOCK_SAFE : DOCK_FREE);
    }

    // 検証用フック（?showcase=1 のときしか存在しない）。3幅の重なり検査で
    // 「なぜその場所を選んだか」を外から確認できるようにしておく。
    window.__scTour = {
      chip, layoutChip, computeDocks, syncDock,
      docks: ()=>({ free: DOCK_FREE, safe: DOCK_SAFE, now: dockNow }),
      obstacles: ()=> obstacleRects().map(r=>({l:r.left|0,t:r.top|0,r:r.right|0,b:r.bottom|0})),
      probes: ()=> probeRects().map(r=>({l:r.left|0,t:r.top|0,r:r.right|0,b:r.bottom|0})),
      candidates: ()=>{
        const vw = innerWidth, vh = innerHeight;
        const obs = obstacleRects().concat(probeRects()).concat(layerPanelFullRect())
          .map(r=>({left:r.left-GAP, top:r.top-GAP, right:r.right+GAP, bottom:r.bottom+GAP}));
        return freeRects(obs, vw, vh)
          .map(c=>({x1:c[0]|0, x2:c[1]|0, y1:c[2]|0, y2:c[3]|0, score:Math.round(scoreRect(c, vw, vh))}))
          .sort((a,b)=> b.score - a.score).slice(0, 8);
      },
      mode: ()=> modeKey,
      pick: ()=> _lastPick,
      cam:  ()=> ({ yaw, pitch, x:camPos.x, y:camPos.y, z:camPos.z, yield:camYield, aborted }),
    };
    // 位置を動かすのは画面サイズが変わった時だけ（章やパネル開閉では動かさない）。
    let layoutTimer = null;
    const onResize = ()=>{ try{ computeDocks(); syncDock(); }catch(_){} };
    addEventListener('resize', onResize);
    addEventListener('orientationchange', onResize);

    // EN切替に追従（showcase=1 のときだけ差し込む安全なラップ）。
    const _origToggleLang = window.toggleLang;
    if(typeof _origToggleLang === 'function'){
      window.toggleLang = function(){ _origToggleLang.apply(this, arguments); try{ paint(); }catch(_){} };
    }
    applyMode(MODES[0]);
    paint();

    // ── 終了 / 章スキップ / カメラの明け渡し ────────
    let aborted = false;        // 「✕ 終了」でのみ true になる
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
    // 章の中断判定: ツアー終了 or この章がスキップされた
    const chapterOver = (token)=> aborted || token !== skipToken;

    // カメラの明け渡し。ユーザーがビューを触った瞬間から、その章の
    // カメラ演出（周回パン・goHome）は行わない。章の頭でリセットするが、
    // 直前まで触っていた場合は続けて譲る（カメラを引ったくらないため）。
    let camYield = false, lastUserInputAt = 0;
    const CAM_YIELD_GRACE = 3000;
    function noteUserInput(){ lastUserInputAt = performance.now(); camYield = true; orbitStop = true; }
    function beginChapterCam(){
      camYield = (performance.now() - lastUserInputAt) < CAM_YIELD_GRACE;
    }
    // ビューを動かす入力だけを拾う。パネルやチップ上のクリック／スクロールは
    // カメラを動かさないので数えない（数えると日照パネルを見ただけで
    // 以降の構図リセットが止まってしまう）。
    function isViewInput(ev){
      const t = ev && ev.target;
      try{
        if(t && t.closest && t.closest('#sc-chip')) return false;
        if(ev.type === 'keydown'){
          const tag = t && t.tagName;
          if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
          if(t && t.isContentEditable) return false;
          return true;                      // WASD / 矢印 などはカメラ操作
        }
        if(t && t.closest && t.closest('#c')) return true;   // ビューポート canvas
        if(t && (t.id === 'c' || t.id === 'joy' || t.id === 'joy-vert')) return true;
        if(t && t.closest && (t.closest('#joy') || t.closest('#joy-vert'))) return true;
        return t === document.body || t === document.documentElement;
      }catch(_){ return false; }
    }
    function onUserInput(ev){ if(isViewInput(ev)) noteUserInput(); }
    const INPUT_EVENTS = ['pointerdown','wheel','touchstart','keydown'];
    INPUT_EVENTS.forEach(ev =>
      window.addEventListener(ev, onUserInput, { passive:true, capture:true }));

    function teardownListeners(){
      INPUT_EVENTS.forEach(ev => window.removeEventListener(ev, onUserInput, { capture:true }));
      removeEventListener('resize', onResize);
      removeEventListener('orientationchange', onResize);
      if(layoutTimer){ clearInterval(layoutTimer); layoutTimer = null; }
    }
    // 「✕ 終了」— ツアーをやめて、開いたツールを全部たたんで操作を渡す。
    function endTour(){
      if(aborted) return;
      aborted = true;
      orbitStop = true;
      releaseWaits();
      teardownListeners();
      fade(false);
      setTimeout(()=>{ try{ chip.remove(); }catch(_){} }, 700);
      try{ restoreAll(); }catch(e){ console.warn('[showcase] restore failed', e); }
    }
    endBtn.addEventListener('click', (e)=>{ e.stopPropagation(); endTour(); });
    skipBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      skipToken++;          // 現在の章を打ち切って次へ
      releaseWaits();
    });

    // ── 復帰用スナップショット ──────────────────────
    const snap = {
      camGrids: null, camFocal: null, camAspect: null, camWasActive: false,
      sunWasActive: false, sunTimeMin: null, envPreset: null,
      sunWx: null, sunFcAuto: null, sunFc: null,
      lpCollapsed: null,
      figureLayerId: null,
      // ツアー開始時のカメラ姿勢（＝シーンの既定＝いちばん見栄えのする画）。
      // 各章の頭でここへ戻すので、章ごとに構図が破綻しない。
      // ただしユーザーがカメラを触っていたら戻さない（camYield）。
      homePos: null, homeYaw: 0, homePitch: 0,
    };
    function captureHome(){
      snap.homePos = camPos.clone(); snap.homeYaw = yaw; snap.homePitch = pitch;
    }
    function goHome(){
      if(camYield) return;              // カメラはユーザーのもの
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
      // 天気（ツアーで切り替えたぶん）を戻す。予報の自動追従フラグも一緒に。
      if(snap.sunWx != null){
        sun.weather = snap.sunWx;
        sun._fcAuto = snap.sunFcAuto;
        if(snap.sunFc){
          sun._fcCloudAmt = snap.sunFc.c; sun._fcRainLevel = snap.sunFc.r;
          sun._fcSnowLevel = snap.sunFc.s; sun._fcPrecip = snap.sunFc.p;
        }
        try{
          document.querySelectorAll('#sun-panel .sun-wx-btn')
            .forEach(b=> b.classList.toggle('on', b.dataset.wx === sun.weather));
        }catch(_){}
      }
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
        if(camYield) return resolve();        // 最初から譲る
        const y0 = yaw, p0 = pitch;
        const t0 = performance.now();
        orbitStop = false;
        (function loop(now){
          // camYield: ユーザーが触った瞬間にパンを止めて操作を渡す（ツアーは続く）
          if(orbitStop || camYield || chapterOver(token)) return resolve();
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

    //  前進。「見回す」だけでなく「歩ける」ことも見せる（本人FB 2026-08-27）。
    function flyForward(meters, durMs, token){
      return new Promise(resolve=>{
        if(camYield) return resolve();
        const p0  = camPos.clone();
        const fwd = V3().set(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
        const t0  = performance.now();
        orbitStop = false;
        (function loop(now){
          if(orbitStop || camYield || chapterOver(token)) return resolve();
          const t = Math.min(1, (now - t0) / durMs);
          const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
          camPos.copy(p0).addScaledVector(fwd, meters * e);
          if(typeof markDirty === 'function') markDirty(2);
          if(t >= 1) return resolve();
          requestAnimationFrame(loop);
        })(performance.now());
      });
    }

    async function chOrbit(token, idx){
      // キャプションと動きは同時に始める（本人FB「ずれててきもちわるい」）。
      // 先に wait を挟むと説明だけ出て絵が止まって見えるので挟まない。
      say('orbit', idx); fade(true);
      await panAround(Math.PI, 4200, token);      // その場で半周
      if(chapterOver(token)) return;
      await flyForward(4.5, 2600, token);         // 数メートル前進（＝歩ける）
      if(chapterOver(token)) return;
      await panAround(Math.PI, 4200, token);      // 残り半周（合計 1 周）
      if(chapterOver(token)) return;
      goHome();                                   // 位置・向きとも既定へ戻す
      await wait(500);
    }

    // ── 章2: 計測 ───────────────────────────────────
    async function chMeasure(token, idx){
      say('measure', idx);
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
    async function chSun(token, idx){
      say('sun', idx);
      if(typeof sun === 'undefined' || typeof window.toggleSunMode !== 'function') return;
      snap.sunWasActive = !!sun.active;
      if(snap.sunTimeMin == null) snap.sunTimeMin = sun.timeMin;
      if(snap.envPreset == null && typeof env !== 'undefined') snap.envPreset = env.preset;
      if(snap.sunWx == null){
        snap.sunWx     = sun.weather;
        snap.sunFcAuto = sun._fcAuto;
        snap.sunFc     = { c:sun._fcCloudAmt, r:sun._fcRainLevel, s:sun._fcSnowLevel, p:sun._fcPrecip };
      }
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
      await wait(600);

      // 天気も切り替えて見せる（本人FB 2026-08-27）。日照パネルの
      // 「🌤 天気」ボタンと同じ経路（onSunWeather）を通す。
      if(typeof window.onSunWeather === 'function'){
        for(const wx of ['cloudy', 'rain', 'clear']){
          if(chapterOver(token)) break;
          window.onSunWeather(wx);
          sub.textContent = (isEN() ? 'Weather  ' : '天気  ') + UI.wx(wx);
          await wait(2000);
        }
      }
      if(chapterOver(token)) return;
      // 空・時刻・天気・環境プリセットまで戻す（残しておくと以降の章が夕焼けのまま）
      restoreSky();
      await wait(300);
    }

    // ── 章4: カメラツール ───────────────────────────
    async function chCamTool(token, idx){
      say('camtool', idx);
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
    async function chFigure(token, idx){
      if(typeof window.addFigureLayer !== 'function') return;
      // カメラの少し前・床(y=0)に立たせる
      const fwd = V3().set(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
      const spot = camPos.clone().addScaledVector(fwd, 3.2); spot.y = 0;
      const before = (typeof layers !== 'undefined') ? layers.map(l=>l.id) : [];
      // モデル読込は数秒かかる。待っているあいだに説明だけ先に出すと
      // 「ずれてる」ので、実際に立った瞬間にキャプションを切り替える。
      await window.addFigureLayer(spot);
      if(chapterOver(token)) return;
      say('figure', idx);
      if(typeof layers !== 'undefined'){
        const added = layers.find(l => l && l.type === 'figure' && before.indexOf(l.id) === -1);
        if(added) snap.figureLayerId = added.id;
      }
      if(typeof markDirty === 'function') markDirty(20);
      await wait(6500);
    }

    // ── 章6: レイヤーパネル ─────────────────────────
    async function chLayers(token, idx){
      say('layers', idx);
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

    //  端末に存在しない機能の章は出さない（存在しないボタン名で案内しない）。
    const ALL_CHAPTERS = [
      { fn: chOrbit,   when: ()=> true },
      { fn: chMeasure, when: HAS.measure },   // 下部ツールバーの📐測定
      { fn: chSun,     when: HAS.sun },       // 下部ツールバーの☀日照
      { fn: chCamTool, when: HAS.cam },       // 下部ツールバーの📷カメラ
      { fn: chFigure,  when: HAS.addObj },    // 📦オブジェクト追加（シーンレイヤー見出し内）
      { fn: chLayers,  when: HAS.layers },    // シーンレイヤーパネル
    ];

    let CHAPTERS = ALL_CHAPTERS;
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

      // チップの定位置をここで決める（以後は動かさない）。
      // ただし「UI が出そろってから」の判定が甘く、スマホではジョイスティック
      // 表示と .cbar の bottom:212px 化がこの後に効くことがある。古い座標で
      // 測ると下部ツールバーに重なったまま固定されてしまう（user 2026-08-14
      // 実測: chip bottom 602 が cbar 575-600 に重なる → 測り直しで解消）。
      // チップはまだ opacity:0 なので、障害物の配置が安定するまで測り直しても
      // 画面上は一切動かない＝「定位置から動かさない」原則は保てる。
      try{
        computeDocks();
        let prevSig = '';
        for(let i = 0; i < 4; i++){
          await wait(350);
          if(aborted) return;
          const sig = JSON.stringify(
            obstacleRects().map(r => [r.left|0, r.top|0, r.right|0, r.bottom|0]));
          if(sig === prevSig) break;      // 2回続けて同じ＝レイアウト確定
          prevSig = sig;
          computeDocks();
        }
        // パネルの開閉に追従してドックを切り替える（FREE と SAFE が同じ端末では何もしない）
        if(layoutTimer) clearInterval(layoutTimer);
        layoutTimer = setInterval(()=>{ try{ syncDock(); }catch(_){} }, 400);
      }catch(e){ console.warn('[showcase] layout failed', e); }

      // 端末に実在する機能だけで章立てを作る（ここで初めて確定する）。
      CHAPTERS = ALL_CHAPTERS.filter(c=>{ try{ return c.when(); }catch(_){ return false; } });
      CHAPTER_COUNT = CHAPTERS.length;
      try{ window.__scTour.chapters = CHAPTERS.length; }catch(_){}

      // イントロ
      say('intro', 0); fade(true);
      await wait(3600);
      if(aborted) return;

      for(let ci = 0; ci < CHAPTERS.length; ci++){
        const ch = CHAPTERS[ci].fn;
        if(aborted) break;
        const token = skipToken;
        try {
          beginChapterCam();  // 章ごとに「カメラを譲るか」を判定し直す
          goHome();           // 章ごとに既定の構図から始める（譲っていれば何もしない）
          await ch(token, ci + 1);
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
      teardownListeners();
      fade(false);
      setTimeout(()=>{ try{ chip.remove(); }catch(_){} }, 700);
    }
    setTimeout(run, 250);
  })();
}
