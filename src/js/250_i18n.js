// ══════════════════════════════════════════════════
//  i18n — 言語切り替え
// ══════════════════════════════════════════════════
window._lang = 'ja';
const I18N = {
  ja:{
    'hb-cam':'── カメラ操作 ──',
    'hb-cam-keys':'<kbd>W/S</kbd> 前後 &nbsp;<kbd>A/D</kbd> 左右<br><kbd>Q/E</kbd> 上下 &nbsp;<kbd>Shift</kbd> 5× 高速<br><kbd>右ドラッグ</kbd> 視点回転<br><kbd>スクロール</kbd> FOV変更 &nbsp;<kbd>Shift+↕</kbd> 速度変更',
    'hb-msr':'── 距離測定 ──',
    'hb-msr-keys':'<kbd>M</kbd> 測定モード ON/OFF<br><kbd>左クリック長押し</kbd> 配置点をプレビュー<br>&nbsp;→ 離したとき確定<br><kbd>X/Y/Z 矢印</kbd> 軸拘束ドラッグ<br><kbd>水平ハンドル□</kbd> XZ平面移動<br><kbd>Z</kbd> 操作を10回まで戻す<br><kbd>Esc</kbd> 測定終了',
    'lbl-pos':'位置','lbl-spd':'速度','lbl-measure':'測定','lbl-flip':'Y軸反転',
    'lbl-addobj':'オブジェクト追加','lbl-quality':'画質','lbl-settings':'設定','lbl-file':'ファイル変更',
    'tb-home':'⚡ ロケハン3D','tb-lang':'EN',
    'lp-title':'📁 シーンレイヤー','lp-add-folder':'📁＋',
    'fp-add-splat':'＋ 3DGS','fp-add-obj':'＋ OBJ/GLB',
    'qp-grid':'グリッド','qp-show':'表示','qp-fov':'FOV','qp-speed':'移動速度',
    'gizmo-title':'📐 距離測定','gizmo-world':'WORLD',
    'pt-a':'点 A','pt-b':'点 B','pt-world':'ワールド座標',
    'step':'ステップ:','dist':'距離:','btn-clear':'🗑 クリア','btn-undo':'↩ 戻る','btn-end':'終了',
    'lt-pos':'▸ 位置','lt-rot':'▸ 回転 (°)','lt-coord':'座標系',
    'lt-world':'🌐 ワールド','lt-local':'📦 ローカル','lt-upaxis':'▸ 上軸',
    'lt-appear':'▸ 外観','lt-color':'色','lt-opacity':'透明度','lt-wire':'ワイヤーフレーム',
    'lt-size':'▸ サイズ','lt-yup':'Y 上','lt-zup':'Z 上',
    'lt-scale':'▸ スケール','lt-viewadj':'▸ 表示調整',
    'lt-flip-x':'X軸反転','lt-flip-y':'Y軸反転','lt-flip-z':'Z軸反転','lt-light':'▸ ライト設定','lt-light-color':'色',
    'lt-light-int':'強度','lt-pos-local':'ローカル','lt-pos-world':'ワールド',
    'onote-txt':'シーンが逆さまですか？','onote-btn':'Y軸を反転',
    'no-scene':'まだシーンがありません',
    'folder-add':'フォルダを追加','folder-collapse':'折りたたむ','folder-expand':'展開する',
    'rename-tip':'ダブルクリックでリネーム','deleted-undo':'🗑 削除（Z で戻す）',
    'loading':'読み込み中...','preparing':'ファイルを準備中','loading-file':'ファイルを読み込み中...',
    'parsing':'シーン解析中...','building-3dgs':'3DGSシーンを構築中...',
    'placing-cam':'カメラを配置中...','error-prefix':'エラー: ',
    'done':'完了！','dl-fail':'ダウンロード失敗: ',
    'redo-none':'これ以上進めません','undo-none':'これ以上戻れません',
    'redo-move':'↪ レイヤー移動を進めました','redo-del':'↪ レイヤー削除を進めました',
    'undo-move':'↩ レイヤー移動を戻しました（Y で進む）','undo-del':'↩ レイヤー削除を戻しました（Y で進む）',
    'undo-msr':'測定モードで Z を押してください',
    'undo-pose':'↩ ポーズを戻しました（Y で進む）','redo-pose':'↪ ポーズを進めました',
    'layer-def':'レイヤー','folder-name':'フォルダ','folder-added':'📁 フォルダを追加',
    'cam-reset-msg':'🏠 カメラを初期位置にリセットしました',
    'ortho-lbl':'⬜ 正投影','persp-lbl':'📐 パース',
    'msr-hint-a':'左クリック長押しで点 A を配置','msr-hint-b':'左クリック長押し → 点 B を配置',
    'msr-hint-done':'左クリック長押し → 再測定 ｜ 矢印でドラッグ微調整',
    'msr-pa':'🟡 点 A を配置 — 離して確定','msr-pb':'🟠 点 B を配置 — 離して確定',
    'msr-active':'📐 測定中','msr-end':'測定終了',
    'undo-info':'Z: 戻る —','undo-max':'これ以上戻れません',
    'undo-done-tpl':'↩ 戻りました（残り {n} 回）',
    'msr-h0':'左クリックで点 A を配置','msr-h1':'左クリックで点 B を配置',
    'msr-h2':'左クリックで再測定 ｜ 矢印でドラッグ微調整',
  'lp-h-scene':'シーンレイヤー',
  'lp-empty':'まだシーンがありません',
  'mf-title-key':'ミニマップ',
  'mf-hint-key':'右クリ長押しで移動先選択',
  'qt-title':'🖥 画質',
  'qt-low':'低',
  'qt-mid':'中',
  'qt-high':'高',
  'lbl-help':'使い方',
  'help-title':'使い方マニュアルを開く',
  'demo-btn-lbl':'デモシーン(交差点)',
  'demo-btn-title':'デモ用の 3DGS シーンを Cloudflare R2 から読み込みます',
  'orient-lock-msg':'横画面でご利用ください',
  'orient-lock-sub':'端末を横向きに回転してください',
  'qp-perf-t':'📊 処理能力モニター',
  'qp-lbl-lowpoly-main':'ポリゴン 1/4',
  'qp-lbl-lowpoly-hint':'PLY/SPLAT のみ・自動で再読み込み',
  'qp-lbl-lowpoly-on':'ON',
  'lowpoly-on':'🎚 ポリゴン 1/4 を適用中…',
  'lowpoly-off':'🎚 ポリゴン 1/4 を解除中…',
  'qp-l-frame':'フレーム時間',
  'qp-l-gpu':'GPU 負荷',
  'qp-l-head':'余剰 (ヘッドルーム)',
  'qp-l-dc':'描画コール',
  'qp-l-tris':'ポリゴン',
  'qp-l-geos':'ジオメトリ',
  'qp-l-texs':'テクスチャ',
  'dist-l':'距離',
  'msr-clear':'🗑 クリア',
  'msr-undo':'戻る',
  'msr-end-lbl-init':'終了',
  'em-h-title':'📤 エクスポート / 保存',
  'em-3dgs':'✨ 3DGSエクスポート',
  'em-3dgs-d':'3D Gaussian Splatting ファイルをエクスポート (.splat/.ply/.spz)',
  'em-zip-save':'📦 プロジェクトZIP保存',
  'em-zip-save-d':'全ファイル（Splat・3Dモデル・キューブ）をZIPに完全保存',
  'em-zip-load':'📂 プロジェクトZIP読込',
  'em-zip-load-d':'保存したZIPファイルからプロジェクトを完全復元',
  'em-json':'💾 JSONのみ保存 (.json)',
  'em-recommended':'★推奨',
  'em-cancel':'キャンセル',
  'qp-settings-t':'⚙ 設定',
  'fp-btn-import-lbl':'読み込み',
  'fp-btn-export-lbl':'書き出し',
    'qp-quality':'🖥 画質','qp-low':'低','qp-mid':'中','qp-high':'高','qp-ultra':'最高',
    'perf-title':'📊 処理能力モニター','perf-ft':'フレーム時間',
    'perf-gpu':'GPU 負荷','perf-head':'余剰 (ヘッドルーム)',
    'perf-dc':'描画コール','perf-tri':'ポリゴン','perf-geo':'ジオメトリ','perf-tex':'テクスチャ',
    'mm-hint2':'右クリック長押し → 離すとその位置に移動 　｜　 スクロール: 5mステップ拡縮',
    'em-splat':'✨ 3DGSエクスポート','em-splat-d':'3D Gaussian Splatting ファイルをエクスポート (.splat/.ply/.spz)',
    'em-zips':'📦 プロジェクトZIP保存','em-zips-d':'全ファイル（Splat・3Dモデル・キューブ）をZIPに完全保存',
    'em-zipl':'📂 プロジェクトZIP読込','em-zipl-d':'保存したZIPファイルからプロジェクトを完全復元',
    'em-json':'💾 JSONのみ保存 (.json)','em-json-d':'軽量メタデータ保存（ファイル未キャッシュ分は除外）',
    'em-glb':'📦 GLBエクスポート','em-glb-d':'OBJ/キューブレイヤーを .glb ファイルとして書き出す',
    'em-obj':'📐 OBJエクスポート','em-obj-d':'OBJ/キューブレイヤーを .obj ファイルとして書き出す',
    'zip-saving':'📦 ZIP保存中...','zip-done':'✅ ZIP保存完了','zip-fail':'⚠ ZIP保存失敗: ',
    'zip-loading':'📦 ZIPを読み込み中...','zip-parsing':'ファイルを解析中...',
    'zip-lib':'ライブラリを読み込み中...','zip-decomp':'ZIPを解凍中...',
    'zip-map':'ファイルマップを構築中...','zip-proj':'プロジェクト情報を読み込み中...',
    'zip-attach':'ファイルデータを割り当て中...','zip-rest':'復元中...',
    'save-ing':'💾 保存中...','save-done':'✅ プロジェクトを保存しました',
    'event-obj':'🟠 イベント','lt-event':'▸ イベント画像',
    'lt-ev-img':'画像をインポート','lt-ev-clr':'画像をクリア',
    'lt-ev-show':'プレビュー','ev-added':'🟠 イベントを追加',
    'saved-cs':'✅ プロジェクトを保存しました','no-scene-save':'⚠ 保存するシーンがありません',
    'folder-color':'フォルダの色を変更',
    'add-suffix':'を追加','load-fail':'⚠ 読み込み失敗: ','no-mesh':'⚠ メッシュが見つかりません: ',
    'light-added':'💡 ライトを追加','light-name':'ライト',
    'map-lbl':'マップ','map-off':'マップ表示',
    'splat-nocache':'⚠ 3DGSデータが未キャッシュです。ファイルを再読み込みしてください',
    'splat-nolayer':'⚠ エクスポートできる3DGSレイヤーがありません',
    'exp-noobj':'⚠ エクスポートできるオブジェクトがありません','exp-fail':'⚠ エクスポート失敗: ',
    'budget-ms':'ms  (予算 ','render-res':'レンダ解像度: ','perf-budget':'予算',
    'mf-col-tip':'折りたたむ',
  },
  en:{
    'hb-cam':'── Camera Controls ──',
    'hb-cam-keys':'<kbd>W/S</kbd> Fwd/Back &nbsp;<kbd>A/D</kbd> Left/Right<br><kbd>Q/E</kbd> Up/Down &nbsp;<kbd>Shift</kbd> 5× Fast<br><kbd>Right drag</kbd> Look around<br><kbd>Scroll</kbd> Change FOV &nbsp;<kbd>Shift+↕</kbd> Change speed',
    'hb-msr':'── Distance Measure ──',
    'hb-msr-keys':'<kbd>M</kbd> Measure mode ON/OFF<br><kbd>Left-click hold</kbd> Preview placement<br>&nbsp;→ Release to confirm<br><kbd>X/Y/Z arrows</kbd> Axis-constrained drag<br><kbd>Flat handle □</kbd> XZ plane move<br><kbd>Z</kbd> Undo up to 10 times<br><kbd>Esc</kbd> End measurement',
    'lbl-pos':'Pos','lbl-spd':'Speed','lbl-measure':'Measure','lbl-flip':'Flip Y',
    'lbl-addobj':'Add Object','lbl-quality':'Quality','lbl-settings':'Settings','lbl-file':'Change File',
    'tb-home':'⚡ LOCAHUN 3D','tb-lang':'JA',
    'lp-title':'📁 Scene Layers','lp-add-folder':'📁＋',
    'fp-add-splat':'＋ 3DGS','fp-add-obj':'＋ OBJ/GLB',
    'qp-grid':'Grid','qp-show':'Show','qp-fov':'FOV','qp-speed':'Move Speed',
    'gizmo-title':'📐 Distance Measure','gizmo-world':'WORLD',
    'pt-a':'Point A','pt-b':'Point B','pt-world':'World coords',
    'step':'Step:','dist':'Dist:','btn-clear':'🗑 Clear','btn-undo':'↩ Undo','btn-end':'End',
    'lt-pos':'▸ Position','lt-rot':'▸ Rotation (°)','lt-coord':'Coord',
    'lt-world':'🌐 World','lt-local':'📦 Local','lt-upaxis':'▸ Up Axis',
    'lt-appear':'▸ Appearance','lt-color':'Color','lt-opacity':'Opacity','lt-wire':'Wireframe',
    'lt-size':'▸ Size','lt-yup':'Y Up','lt-zup':'Z Up',
    'lt-scale':'▸ Scale','lt-viewadj':'▸ View Adjust',
    'lt-flip-x':'Flip X-Axis','lt-flip-y':'Flip Y-Axis','lt-flip-z':'Flip Z-Axis','lt-light':'▸ Light Settings','lt-light-color':'Color',
    'lt-light-int':'Intensity','lt-pos-local':'Local','lt-pos-world':'World',
    'onote-txt':'Scene upside down?','onote-btn':'Flip Y-Axis',
    'no-scene':'No scene yet',
    'folder-add':'Add folder','folder-collapse':'Collapse','folder-expand':'Expand',
    'rename-tip':'Dbl-click to rename','deleted-undo':'🗑 Deleted (Z to undo)',
    'loading':'Loading...','preparing':'Preparing file','loading-file':'Loading file...',
    'parsing':'Parsing scene...','building-3dgs':'Building 3DGS scene...',
    'placing-cam':'Placing camera...','error-prefix':'Error: ',
    'done':'Done!','dl-fail':'Download failed: ',
    'redo-none':'Nothing to redo','undo-none':'Nothing to undo',
    'redo-move':'↪ Redid layer move','redo-del':'↪ Redid layer delete',
    'undo-move':'↩ Undid layer move (Y to redo)','undo-del':'↩ Undid layer delete (Y to redo)',
    'undo-msr':'Press Z in measure mode',
    'undo-pose':'↩ Undid pose (Y to redo)','redo-pose':'↪ Redid pose',
    'layer-def':'Layer','folder-name':'Folder','folder-added':'📁 Folder added',
    'cam-reset-msg':'🏠 Camera reset to initial position',
    'ortho-lbl':'⬜ Ortho','persp-lbl':'📐 Perspective',
    'msr-hint-a':'Left-click to place Point A','msr-hint-b':'Left-click hold to place Point B',
    'msr-hint-done':'Left-click hold to re-measure | Drag arrows to fine-tune',
    'msr-pa':'🟡 Placing Point A — release to confirm','msr-pb':'🟠 Placing Point B — release to confirm',
    'msr-active':'📐 Measuring','msr-end':'End Measurement',
    'undo-info':'Z: Undo —','undo-max':'No more undos',
    'undo-done-tpl':'↩ Undone ({n} remaining)',
    'msr-h0':'Left-click to place Point A','msr-h1':'Left-click to place Point B',
    'msr-h2':'Left-click to re-measure | Drag arrows to fine-tune',
  'lp-h-scene':'Scene Layers',
  'lp-empty':'No scene yet',
  'mf-title-key':'Minimap',
  'mf-hint-key':'Right-click hold to choose target',
  'qt-title':'🖥 Quality',
  'qt-low':'Low',
  'qt-mid':'Mid',
  'qt-high':'High',
  'lbl-help':'Help',
  'help-title':'Open the user manual',
  'demo-btn-lbl':'Demo Scene (Intersection)',
  'demo-btn-title':'Load the demo 3DGS scene from Cloudflare R2',
  'orient-lock-msg':'Please use in landscape',
  'orient-lock-sub':'Rotate your device to landscape',
  'qp-perf-t':'📊 Performance Monitor',
  'qp-lbl-lowpoly-main':'Splats 1/4',
  'qp-lbl-lowpoly-hint':'PLY/SPLAT only — auto reload',
  'qp-lbl-lowpoly-on':'ON',
  'lowpoly-on':'🎚 Reducing splats to 1/4…',
  'lowpoly-off':'🎚 Restoring full splat count…',
  'qp-l-frame':'Frame Time',
  'qp-l-gpu':'GPU Load',
  'qp-l-head':'Headroom',
  'qp-l-dc':'Draw Calls',
  'qp-l-tris':'Polygons',
  'qp-l-geos':'Geometries',
  'qp-l-texs':'Textures',
  'dist-l':'Distance',
  'msr-clear':'🗑 Clear',
  'msr-undo':'Undo',
  'msr-end-lbl-init':'End',
  'em-h-title':'📤 Export / Save',
  'em-3dgs':'✨ 3DGS Export',
  'em-3dgs-d':'Export 3D Gaussian Splatting file (.splat/.ply/.spz)',
  'em-zip-save':'📦 Save Project ZIP',
  'em-zip-save-d':'Saves all files (Splat / 3D models / cubes) into one ZIP',
  'em-zip-load':'📂 Load Project ZIP',
  'em-zip-load-d':'Restore project from a previously saved ZIP',
  'em-json':'💾 Save JSON only (.json)',
  'em-recommended':'★Recommended',
  'em-cancel':'Cancel',
  'qp-settings-t':'⚙ Settings',
  'fp-btn-import-lbl':'Import',
  'fp-btn-export-lbl':'Export',
    'qp-quality':'🖥 Quality','qp-low':'Low','qp-mid':'Med','qp-high':'High','qp-ultra':'Ultra',
    'perf-title':'📊 Performance Monitor','perf-ft':'Frame Time',
    'perf-gpu':'GPU Load','perf-head':'Headroom',
    'perf-dc':'Draw Calls','perf-tri':'Polygons','perf-geo':'Geometries','perf-tex':'Textures',
    'mm-hint2':'Right-click hold → release to teleport 　|　 Scroll: 5m step zoom',
    'em-splat':'✨ 3DGS Export','em-splat-d':'Export 3D Gaussian Splatting file (.splat/.ply/.spz)',
    'em-zips':'📦 Project ZIP Save','em-zips-d':'Save all files (Splat/3D models/Cubes) to ZIP',
    'em-zipl':'📂 Project ZIP Load','em-zipl-d':'Restore project from saved ZIP file',
    'em-json':'💾 JSON Only (.json)','em-json-d':'Lightweight metadata save (excludes uncached files)',
    'em-glb':'📦 GLB Export','em-glb-d':'Export OBJ/Cube layers as .glb file',
    'em-obj':'📐 OBJ Export','em-obj-d':'Export OBJ/Cube layers as .obj file',
    'zip-saving':'📦 Saving ZIP...','zip-done':'✅ ZIP saved','zip-fail':'⚠ ZIP save failed: ',
    'zip-loading':'📦 Loading ZIP...','zip-parsing':'Parsing file...',
    'zip-lib':'Loading libraries...','zip-decomp':'Decompressing ZIP...',
    'zip-map':'Building file map...','zip-proj':'Loading project info...',
    'zip-attach':'Assigning file data...','zip-rest':'Restoring...',
    'save-ing':'💾 Saving...','save-done':'✅ Project saved',
    'event-obj':'🟠 Event','lt-event':'▸ Event Image',
    'lt-ev-img':'Import Image','lt-ev-clr':'Clear Image',
    'lt-ev-show':'Preview','ev-added':'🟠 Event added',
    'saved-cs':'✅ Project saved','no-scene-save':'⚠ No scene to save',
    'folder-color':'Change folder color',
    'add-suffix':' added','load-fail':'⚠ Load failed: ','no-mesh':'⚠ No mesh found: ',
    'light-added':'💡 Light added','light-name':'Light',
    'map-lbl':'Map','map-off':'Show Map',
    'splat-nocache':'⚠ 3DGS data not cached. Please reload file',
    'splat-nolayer':'⚠ No 3DGS layers to export',
    'exp-noobj':'⚠ No objects to export','exp-fail':'⚠ Export failed: ',
    'budget-ms':'ms  (budget ','render-res':'Render resolution: ','perf-budget':'budget',
    'mf-col-tip':'Collapse',
  }
};
function T(key){ return I18N[window._lang]?.[key] ?? I18N.ja[key] ?? key; }

window.toggleLang = function(){
  window._lang = window._lang==='ja'?'en':'ja';
  applyI18n();
};
function applyI18n(){
  const L=window._lang;
  // Topbar — only translate the brand TEXT label, NOT the whole button.
  // (Previously `homeBtn.textContent=T('tb-home')` overwrote the button's
  //  innerHTML, nuking the ロケハン3D SVG brand icon and replacing it with a ⚡
  //  emoji. The SVG lives in the markup; #tb-brand-text carries data-i18n
  //  ="tb-brand" and is translated by the [data-i18n] loop below, so here we
  //  just leave the icon intact — user 2026-06-27 "稲妻ではなくロケハン3Dアイコンに".)
  const langBtn=document.getElementById('tb-lang-btn');
  if(langBtn) langBtn.textContent=T('tb-lang');
  // Helpbox data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const k=el.getAttribute('data-i18n');
    el.innerHTML=T(k);
  });
  // 日照パネルの都市ドロップダウンを言語に合わせて翻訳
  if(typeof _sunApplyCityI18n==='function') _sunApplyCityI18n();
  // HUD labels
  ['lbl-pos','lbl-spd','lbl-rot','lbl-measure','lbl-flip','lbl-addobj','lbl-quality','lbl-settings','lbl-file','lbl-cam-reset','lbl-camtool','lbl-env','lbl-help','orient-lock-msg','orient-lock-sub','lbl-addobj-top','lbl-addfig-top','tb-save-lbl','tb-undo-lbl','tb-load-lbl','tb-report-lbl','fp-btn-import-lbl','fp-btn-export-lbl','csp-shot-info','csp-cam-info','csp-meta-info','csp-shot-name','csp-rig','csp-env','csp-note','csp-capture','csp-burnin','csp-burnin-grid','csp-capture-btn','csp-salvage','csp-salvage-drop','csp-salvage-sub','ct-tool','ct-lens','ct-focal','ct-sensor','ct-sensor-ff','ct-sensor-apsc','ct-sensor-apsh','ct-sensor-mft','ct-sensor-1inch','ct-sensor-phone13','ct-sensor-phone17','ct-sensor-phone23','ct-sensor-m65','ct-sensor-s35','ct-sensor-bm','ct-sensor-cust','ct-sensor-w','ct-sensor-h','ct-cam-angle','ct-pan','ct-tilt','ct-roll','ct-roll-level','ct-wb','ct-wb-temp','ct-aspect','ct-aspect-sensor','ct-aspect-cust','ct-aspect-apply','ct-margin','ct-grid','ct-grid-multi','ct-grid-guide','ct-grid-off','ct-grid-thirds','ct-grid-golden','ct-grid-cross','ct-grid-diag','ct-grid-safe-cust','ct-grid-action','ct-grid-title','ct-grid-center','ct-grid-custom','ct-grid-cols','ct-grid-rows','ct-grid-opacity','dz-manual-text','dz-ar-label','env-h-title','env-p-off','env-p-day','env-p-morning','env-p-evening','env-p-night','env-p-cloudy','env-p-rain','env-p-overcast','env-p-twilight','env-l-rot','env-l-int','msr-active-lbl','msr-end-lbl','lp-h-scene','lp-empty','qt-title','qt-low','qt-mid','qt-high','qp-perf-t','qp-l-frame','qp-l-gpu','qp-l-head','qp-l-dc','qp-l-tris','qp-l-geos','qp-l-texs','dist-l','msr-clear','msr-undo','em-3dgs','em-3dgs-d','em-zip-save','em-zip-save-d','em-zip-load','em-zip-load-d','em-json','em-json-d','em-glb','em-glb-d','em-obj','em-obj-d','em-cancel','em-recommended','em-h-title','qp-settings-t','qp-lbl-lowpoly-main','qp-lbl-lowpoly-hint','qp-lbl-grid','qp-lbl-show','qp-lbl-fov','qp-lbl-spd','cl-title','cl-sub','cl-tag-init','cl-tag-v003','lbl-walk','lbl-save-camera','lbl-view-rec','lbl-view-rec-phone','lbl-cam-anim','giz-pt-a','giz-pt-b','giz-pt-c','giz-height-lbl','height-l','csp-jpeg-q','csp-4k-lbl','obj-add-cube','obj-add-sphere','obj-add-light','obj-add-event','obj-add-path','msr-end-lbl-init'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.textContent=T(id);
  });
  // HUD info-box edit tooltip + dropzone titles
  document.querySelectorAll('#hud .ibox .ibv').forEach(el=>{ el.title=T('tt-edit-dbl'); });
  // Manual: header / nav / close button via data-i18n-key attributes
  document.querySelectorAll('#manual-overlay [data-i18n-key]').forEach(el=>{
    el.textContent=T(el.getAttribute('data-i18n-key'));
  });
  // Manual body: toggle JA/EN dual block visibility
  const _mo=document.getElementById('manual-overlay');
  if(_mo) _mo.classList.toggle('lang-en', L==='en');
  // Title attributes (tooltips) — not auto-handled by data-i18n
  const _setTitle=(sel,key)=>{ const el=document.querySelector(sel); if(el) el.title=T(key); };
  _setTitle('#btnHelp','tt-help');
  _setTitle('#btnAddCubeTop','tt-add-obj');
  _setTitle('#tb-project-name','tt-edit-name');
  _setTitle('#tb-undo-btn','tt-undo');
  _setTitle('#mf-collapse-btn','tt-mf-collapse');
  // Cam reset button has no stable id; locate via lbl-cam-reset child
  const _camResetBtn=document.getElementById('lbl-cam-reset');
  if(_camResetBtn && _camResetBtn.parentElement) _camResetBtn.parentElement.title=T('tt-cam-reset');
  // Folder add button (in layer panel)
  document.querySelectorAll('button[onclick*="addFolder"]').forEach(b=>{ b.title=T('tt-folder-add'); });
  // Camera-tool top-row additions (multi-cam, view-rec, cam-anim) — their
  // title attributes were authored in JA in markup; translate them on
  // every language switch so EN users see English tooltips.
  const _camTopBtns = [
    ['btnSaveCamera',     'tt-save-camera'],
    ['btnViewRec',        'tt-view-rec'],
    ['btnViewRecPhone',   'tt-view-rec'],
    ['btnCamAnim',        'tt-cam-anim'],
  ];
  for(const [id, key] of _camTopBtns){
    const el = document.getElementById(id);
    if(el) el.title = T(key);
  }
  // Other JA-authored title tooltips (bug-report button, quality badge).
  const _moreTitles = [['tb-report-btn','tt-report'],['qi-badge','tt-qibadge']];
  for(const [id, key] of _moreTitles){
    const el = document.getElementById(id);
    if(el) el.title = T(key);
  }
  // Re-render the cam-anim panel (if open) so its inline-bilingual content
  // refreshes on language switch — the panel paints once at toggle time
  // and otherwise only on key add/remove, so without this hook it'd keep
  // the old-language strings until the user adds a key.
  if(typeof camAnim !== 'undefined' && camAnim.open
     && typeof _camAnimRenderPanel === 'function'){
    try { _camAnimRenderPanel(); } catch(e){}
  }
  // Save/Load buttons in topbar
  document.querySelectorAll('#topbar button').forEach(b=>{
    const oc=b.getAttribute('onclick')||'';
    if(oc.includes('saveProjectZip')) b.title=T('tt-zip-save');
    else if(oc.includes('loadProjectZip')) b.title=T('tt-zip-load');
  });
  // White-balance preset buttons
  const _wbMap={5600:'tt-wb-day',7500:'tt-wb-shade',3200:'tt-wb-tungsten'};
  document.querySelectorAll('.cm-wb-btn').forEach(b=>{
    const oc=b.getAttribute('onclick')||'';
    const m=oc.match(/setCamWBPreset\((\d+)\)/);
    if(m && _wbMap[m[1]]) b.title=T(_wbMap[m[1]]);
  });
  // Layer panel title is translated via the inner #lp-h-scene span in the
  // ID list above. Don't overwrite the leading text node ("📁 ") here —
  // doing so would inject the full title string before the span, producing
  // "📁 シーンレイヤー シーンレイヤー" duplicated rendering.
  // Orientation notice
  const onoteEl=document.getElementById('onote');
  if(onoteEl){
    const btn=onoteEl.querySelector('button');
    const txt=onoteEl.childNodes[0];
    if(txt) txt.textContent=T('onote-txt')+' ';
    if(btn) btn.textContent=T('onote-btn');
  }
  // Gizmo panel title
  const gizmoTitle=document.querySelector('#gizmo .gt');
  if(gizmoTitle){
    const badge=gizmoTitle.querySelector('.world-badge');
    gizmoTitle.innerHTML=T('gizmo-title')+' ';
    if(badge) gizmoTitle.appendChild(badge);
  }
  // The bulk loop above reset #giz-height-lbl to the static "add" wording;
  // re-apply so it reflects the live height-mode state (add vs remove).
  if(typeof _applyHeightUI==='function' && typeof msr!=='undefined') _applyHeightUI(msr.heightOn);
  // Quality badge (top-right) — labels are 低/中/高 -> Low/Mid/High.
  if(typeof _updateQiBadgeLabel==='function' && typeof qualIdx!=='undefined') _updateQiBadgeLabel(qualIdx);
  // Help button tooltip (title attribute isn't covered by the textContent loop).
  const _btnHelp=document.getElementById('btnHelp'); if(_btnHelp) _btnHelp.title=T('help-title');
  // Demo-scene dropzone button: label includes the file size, and the title
  // attribute needs translating too — neither is handled by the bulk loop.
  const _demoLbl=document.getElementById('dz-demo-lbl');
  if(_demoLbl && typeof DEMO_SCENE_SIZE_MB!=='undefined') _demoLbl.textContent=`${T('demo-btn-lbl')} (${DEMO_SCENE_SIZE_MB}MB)`;
  const _demoBtn=document.getElementById('dz-demo-btn'); if(_demoBtn) _demoBtn.title=T('demo-btn-title');
  // Camera burn-in metadata input placeholders (placeholder attr isn't covered
  // by the textContent loop). Shot/Rig are neutral so only env/note localise.
  const _phEnv=document.getElementById('cm-env'); if(_phEnv) _phEnv.placeholder=T('ph-cm-env');
  const _phNote=document.getElementById('cm-note'); if(_phNote) _phNote.placeholder=T('ph-cm-note');
  // The low-poly hint popover bakes its strings at show-time and doesn't watch
  // language; rebuild it in the new language if it's currently visible.
  if(document.getElementById('lowpoly-hint') && typeof window.showLowPolyHint==='function') window.showLowPolyHint();
  // Re-render dynamic UI
  document.getElementById('html-root').lang = L;
  // Refresh update-check button label according to current state
  if(typeof _setUpdateBtn === 'function' && typeof _updateState !== 'undefined'){
    _setUpdateBtn(_updateState.status === 'idle' ? 'idle' : _updateState.status);
  }
  // Refresh integrity badge tooltip in current language
  if(typeof _setIntegrityIndicator === 'function'){
    _setIntegrityIndicator();
  }
  // Refresh the reset / reposition button label depending on walk mode
  if(typeof _refreshResetBtnLabel === 'function'){
    _refreshResetBtnLabel();
  }
  // Update walk button tooltip
  const _wb = document.getElementById('btnAvatarWalk');
  if(_wb) _wb.title = T('tt-walk');
  // Refresh dynamic camera HUD strings (lens / angle text uses T())
  if(typeof updateCamHud === 'function' && typeof cam !== 'undefined' && cam.active){
    updateCamHud();
  }
  // ── Home screen & extended elements ──
  const _s=(id,key)=>{ const e=document.getElementById(id); if(e) e.textContent=T(key); };
  _s('dz-h1','dz-h1'); _s('dz-sub','dz-sub');
  _s('dz-drop-text','dz-drop-text'); _s('dz-empty-text','dz-empty-text'); _s('dz-back-site-lbl','dz-back-site-lbl');
  _s('dz-zip-text','dz-zip-text'); _s('dz-continue-text','dz-continue-text');
  _s('mf-title','mf-title');
  const mfHint=document.getElementById('mf-hint'); if(mfHint) mfHint.textContent=T('mf-hint');
  // Layer panel header text is owned by the inner #lp-h-scene span (handled
  // via the ID list above). Don't overwrite the leading text node — that
  // would inject the full "📁 Scene Layers" string before the span and
  // produce a duplicate "📁 Scene Layers Scene Layers" rendering after a
  // language toggle.
  _s('fp-btn-splat','fp-btn-splat'); _s('fp-btn-obj','fp-btn-obj');
  const qpT=document.querySelector('#qpanel .qt'); if(qpT) qpT.textContent=T('qp-title');
  const emT=document.querySelector('#export-modal .em-title'); if(emT) emT.textContent=T('em-title');
  const emC=document.querySelector('#export-modal .em-close'); if(emC) emC.textContent=T('btn-cancel');
  // Re-render layer list with correct language
  renderLayerList();
  renderTransformPanel();
}

// ── Reset to home (soft nav, scene preserved) ──
// Toggle behaviour: if the home dropzone is already visible AND there is
// an active scene to return to, a second LOCAHUN 3D click should resume
// editing instead of doing nothing. This mirrors the "Continue Editing"
// dropzone button without forcing the user to scroll down to find it.
window.resetToHome = function(){
  const dz=document.getElementById('dz');
  if(!dz) return;
  const dzVisible = dz.style.display !== 'none' && !dz.classList.contains('fade');
  if(dzVisible && layers.length > 0){
    // Already on home with a scene loaded → toggle back to editing.
    continueEditing();
    return;
  }
  clearTimeout(_hideDzTimer); _hideDzTimer=null; // cancel any pending hide
  dz.style.display='flex'; // explicitly restore flex, not just ''
  dz.style.opacity='1';
  dz.classList.remove('fade');
  dz.style.pointerEvents=''; // ensure pointer events are active
  const contBtn=document.getElementById('dz-continue-btn');
  if(contBtn) contBtn.style.display=layers.length>0?'':'none';
  history.pushState({view:'home'}, '', location.href);
};

window.continueEditing = function(){
  const dz=document.getElementById('dz');
  dz.classList.add('fade');
  setTimeout(()=>{ dz.style.display='none'; }, 480);
  history.back(); // restore history state
};

// Browser Back button: if scene exists, just hide the home overlay
window.addEventListener('popstate', ()=>{
  if(layers.length>0){
    const dz=document.getElementById('dz');
    if(dz.style.display!=='none'){
      dz.classList.add('fade');
      setTimeout(()=>{ dz.style.display='none'; }, 480);
    }
  }
});

const LAYER_ICONS={ splat:'✨', obj:'📐', cube:'📦', sphere:'⚽', folder:'📁', light:'💡', event:'🟠', figure:'👤', camera:'🎥', path:'🛣' };

// ── Per-layer Splat axis-flip (180° rotation around X / Y / Z, composable) ──
const FLIP_QUATS = {
  x: new THREE.Quaternion(1,0,0,0),
  y: new THREE.Quaternion(0,1,0,0),
  z: new THREE.Quaternion(0,0,1,0),
};
// Load-time orient flip applied automatically to PLY / SPZ files because they
// use a different up-axis convention than the viewer.
const LOAD_FLIP_QUAT = new THREE.Quaternion(1,0,0,0);  // 180° around X

// Build the splat layer's "orientation correction" quaternion from its flag
// state (load-flip + axis flips). Does NOT include the user-controlled
// rotation (L.rot); that is composed separately so changing position/scale
// never wipes out the orientation correction.
function computeSplatFlipQuat(L){
  const q = new THREE.Quaternion();
  if(L._loadFlipped)   q.multiply(LOAD_FLIP_QUAT);
  if(L._flipAxes){
    if(L._flipAxes.x) q.multiply(FLIP_QUATS.x);
    if(L._flipAxes.y) q.multiply(FLIP_QUATS.y);
    if(L._flipAxes.z) q.multiply(FLIP_QUATS.z);
  }
  return q;
}

// Apply user rotation (L.rot in degrees) composed with the orientation flip.
// Used by both the dedicated flip-toggle commands and applyLayerTransform.
function applyLayerFlipQuat(L){
  if(!L || !L.mesh) return;
  const flipQ = computeSplatFlipQuat(L);
  const userEuler = new THREE.Euler(
    THREE.MathUtils.degToRad(L.rot?.x || 0),
    THREE.MathUtils.degToRad(L.rot?.y || 0),
    THREE.MathUtils.degToRad(L.rot?.z || 0), 'XYZ');
  const userQ = new THREE.Quaternion().setFromEuler(userEuler);
  // Order: flip first, then user rotation in world space.
  L.mesh.quaternion.copy(userQ).multiply(flipQ);
}
window.flipLayerOrientation = function(id, axis){
  const L=findLayer(id); if(!L||L.type!=='splat'||!L.mesh) return;
  axis = axis || 'x';
  // Migrate legacy _flipped (true ⇒ 180° around X axis)
  if(!L._flipAxes) L._flipAxes = {x: !!L._flipped, y:false, z:false};
  L._flipAxes[axis] = !L._flipAxes[axis];
  // Keep legacy field roughly in sync (true if any flip applied)
  L._flipped = L._flipAxes.x || L._flipAxes.y || L._flipAxes.z;
  applyLayerFlipQuat(L);
  renderTransformPanel();
  markDirty(8);
};
// (Portalcam X-90 preset removed 2026-05; users can still use the
// per-axis flip buttons (X/Y/Z) on the layer transform panel for the
// same end result.)

// ── Light layer controls ──
window.setLightColor = function(id,hex){
  const L=findLayer(id); if(!L||L.type!=='light') return;
  L.lightColor=hex;
  if(L.mesh) L.mesh.color.set(hex);
  markDirty(4);
};
window.setLightIntensity = function(id,val){
  const L=findLayer(id); if(!L||L.type!=='light') return;
  L.lightIntensity=val;
  if(L.mesh) L.mesh.intensity=val;
  renderTransformPanel();
  markDirty(4);
};

