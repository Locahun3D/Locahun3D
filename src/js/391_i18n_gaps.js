// ═══ i18n gaps (2026-09-20) ═══
// Keys for UI text that had no English path: walk-setup dialog, tooltips /
// aria-labels driven by the generic data-i18n-title / data-i18n-aria pass in
// applyI18n(), and the event / path blocks of the object-info panel.
Object.assign(I18N.ja,{
  'btn-close':'閉じる',
  'initializing':'初期化中',
  'walk-setup-title':'アバター歩行',
  'walk-cell-lbl':'判定セルの大きさ (m)','walk-radius-lbl':'生成範囲の半径 (m)',
  'walk-generate':'判定を生成','walk-use-mesh':'選択メッシュの判定を切替',
  'walk-exclude':'選択立方体の除外範囲を切替',
  'walk-preview-lbl':'近似判定を表示','walk-mesh-only-lbl':'選択メッシュのみで判定',
  'walk-save-spawn':'開始位置を保存','walk-toggle':'歩行 / 終了',
  'walk-status-none':'判定形状は未生成です。',
  'sun-rl-moonrise':'🌘 月の出','sun-rl-moonset':'🌗 月の入り',
  'tt-sunrise':'日の出','tt-sunset':'日の入り',
  'tt-sun-fetch-wx':'選択中の場所・日付・時刻の実際の天気予報を読み込み、上の天気を自動設定します（インターネット接続が必要）',
  'tt-add-figure':'フィギュア追加（リグ付き人型モデル・配置場所を左クリック）',
  'tt-add-path':'4点を左クリックで囲んで区画を作成（駐車スペース等）。中央にテキストを表示できます',
  'tt-home':'ホームに戻る — ロケハン3D','aria-home':'ロケハン3D — Home',
  'tt-fullscreen':'全画面表示','tt-fullscreen-exit':'全画面を終了','tt-immersive-exit':'全画面表示を終了',
  'tt-msr-close':'測定を閉じる',
  'tt-ev-zoom':'クリックで拡大','lt-ev-guide':'🗒 イベントガイド','ph-ev-guide':'ガイドテキスト...',
  'lt-path':'🛣 パス情報','lt-path-hint':'黄色い4点をドラッグで形を調整できます',
  'lt-path-color':'色','tt-path-color':'パスの色','lt-path-opacity':'不透明度',
  'lt-path-width':'太さ (m)','aria-path-width':'パスの太さ (m)',
  'lt-path-label':'🅿 中央テキスト','ph-path-label':'例: 来客用 P1 / 搬入車両 ...',
});
Object.assign(I18N.en,{
  'btn-close':'Close',
  'initializing':'Initializing',
  'walk-setup-title':'Avatar walk',
  'walk-cell-lbl':'Collision cell size (m)','walk-radius-lbl':'Generation radius (m)',
  'walk-generate':'Generate collision','walk-use-mesh':'Toggle collision for selected mesh',
  'walk-exclude':'Toggle exclusion zone for selected cube',
  'walk-preview-lbl':'Show collision preview','walk-mesh-only-lbl':'Use selected meshes only',
  'walk-save-spawn':'Save start position','walk-toggle':'Walk / Exit',
  'walk-status-none':'No collision generated yet.',
  'sun-rl-moonrise':'🌘 Moonrise','sun-rl-moonset':'🌗 Moonset',
  'tt-sunrise':'Sunrise','tt-sunset':'Sunset',
  'tt-sun-fetch-wx':'Load the real forecast for the selected place, date and time and set the weather above automatically (needs an internet connection)',
  'tt-add-figure':'Add a figure (rigged human model — click where to place it)',
  'tt-add-path':'Click 4 points to outline an area (parking space, etc.). You can show text in its center',
  'tt-home':'Back to home — Locahun 3D','aria-home':'Locahun 3D — Home',
  'tt-fullscreen':'Fullscreen','tt-fullscreen-exit':'Exit fullscreen','tt-immersive-exit':'Exit fullscreen',
  'tt-msr-close':'Close Measure',
  'tt-ev-zoom':'Click to enlarge','lt-ev-guide':'🗒 Event guide','ph-ev-guide':'Guide text...',
  'lt-path':'🛣 Path info','lt-path-hint':'Drag the four yellow points to adjust the shape',
  'lt-path-color':'Color','tt-path-color':'Path color','lt-path-opacity':'Opacity',
  'lt-path-width':'Width (m)','aria-path-width':'Path width (m)',
  'lt-path-label':'🅿 Center text','ph-path-label':'e.g. Visitor P1 / Loading vehicles ...',
});

// State-dependent pieces that a plain data-i18n attribute cannot express.
// Called at the end of applyI18n().
function _applyI18nGaps(){
  // AR button tooltip follows the AR state.
  const ar=document.getElementById('btnAR');
  if(ar) ar.title=T((typeof arMode!=='undefined' && arMode.active)?'tt-ar-exit':'tt-ar');
  // Phone fullscreen toggle follows the fullscreen state.
  const fs=document.getElementById('tb-fullscreen-btn');
  if(fs) fs.title=T((document.fullscreenElement||document.webkitFullscreenElement)?'tt-fullscreen-exit':'tt-fullscreen');
  // Walk jump button paints its own label from window._lang.
  if(typeof _syncWalkJumpButton==='function' && typeof walkMode!=='undefined') _syncWalkJumpButton();
  // Texts that carry live status: only swap them while they still show a
  // stock phrase, never overwrite a status message or the loading guide.
  const swap=(id,keys)=>{
    const el=document.getElementById(id); if(!el || el.children.length) return;
    const cur=el.textContent;
    for(const k of keys){ if(cur===I18N.ja[k] || cur===I18N.en[k]){ el.textContent=T(k); return; } }
  };
  swap('lt',['loading']);
  swap('lm',['initializing']);
  swap('walk-status',['walk-status-none']);
  // Equipment cards: dimension tooltips (JA/EN pairs live on the element).
  document.querySelectorAll('[data-title-ja]').forEach(el=>{ el.title=_en()?el.dataset.titleEn:el.dataset.titleJa; });
}
