// ══════════════════════════════════════════════════
//  AUTO CAMERA PLACEMENT — ブラウザ側の配線
//
//  設計書: F:\Claude\docs\設計_カメラ初期位置の自動決定パイプライン_2026-08-13.md
//
//  役割は3つだけ:
//    ① シーンの splat から CPU 側で点群を取り出す（Spark依存はここに閉じる）
//    ② 174 の純粋エンジンへ渡して位置・向き・信頼度を得る
//    ③ 結果を既存の初期視点（_initCamPos/_initYaw/_initPitch）へ書き込み、
//       手動ボタン(📍)と同じ状態にする（気に入らなければ📍で上書きできる）
// ══════════════════════════════════════════════════

// ── half-float(IEEE 754 binary16) → number ──────────────────────
// Spark の packed splat は中心座標を half で持つ。unpackSplat() を import すると
// 010_state.js の import 行（オンライン版と共用）を触ることになるので、必要な
// 「中心座標だけ」をここで自前に展開する。値の解釈は Spark の fromHalf と同一。
const _AC_HALF_BUF = new ArrayBuffer(4);
const _AC_HALF_U32 = new Uint32Array(_AC_HALF_BUF);
const _AC_HALF_F32 = new Float32Array(_AC_HALF_BUF);
function _acFromHalf(h){
  const s = (h & 0x8000) << 16;
  const e = (h >> 10) & 0x1f;
  const m = h & 0x3ff;
  if(e === 0){
    if(m === 0){ _AC_HALF_U32[0] = s; return _AC_HALF_F32[0]; }
    // subnormal: 正規化しなおす
    let ex = -1, mm = m;
    do { mm <<= 1; ex++; } while(!(mm & 0x400));
    _AC_HALF_U32[0] = s | ((127 - 15 - ex) << 23) | ((mm & 0x3ff) << 13);
    return _AC_HALF_F32[0];
  }
  if(e === 31){ _AC_HALF_U32[0] = s | 0x7f800000 | (m << 13); return _AC_HALF_F32[0]; }
  _AC_HALF_U32[0] = s | ((e - 15 + 127) << 23) | (m << 13);
  return _AC_HALF_F32[0];
}

// ── splat 点群の取り出し ────────────────────────────────────────
// Spark 2.0 の CPU 側データ配置（vendor の SplatMesh.raycast() と同じ経路）:
//   ・RAD(paged)      : mesh.paged.pager.packedTexture.value.image.data が
//                       常駐ページの packed 配列、mesh.paged.dynoIndices…が
//                       「描画順index → packed index」。＝いま実際に画面へ出て
//                       いる LOD 解決済みの集合。設計書の「最粗LODで十分」は
//                       ここから等間隔に間引くことで満たす。
//   ・PLY/SPLAT 等    : mesh.packedSplats.packedArray（インデックス無し）
// どちらも 1 splat = 4 × uint32。中心は word1(x,y) と word2 下位16bit(z)。
// 座標はメッシュローカルなので matrixWorld を掛けてワールドへ。
function _acCollectSplatPoints(targetCount){
  const target = targetCount || 150000;   // 設計書 §2-0: 5万〜20万点
  if(typeof layers === 'undefined' || !layers) return { points:null, count:0, meshes:0 };
  const src = [];
  let total = 0;
  for(const L of layers){
    if(!L || L.type !== 'splat' || !L.mesh || L.visible === false) continue;
    const mesh = L.mesh;
    let packed = null, indices = null, n = 0;
    try {
      if(mesh.paged && mesh.paged.pager && mesh.paged.pager.packedTexture){
        packed  = mesh.paged.pager.packedTexture.value.image.data;
        indices = mesh.paged.dynoIndices && mesh.paged.dynoIndices.value &&
                  mesh.paged.dynoIndices.value.image ? mesh.paged.dynoIndices.value.image.data : null;
        n = mesh.paged.numSplats || 0;
      } else if(mesh.packedSplats && mesh.packedSplats.packedArray){
        packed = mesh.packedSplats.packedArray;
        n = mesh.packedSplats.numSplats || 0;
      }
    } catch(e){ console.warn('[autocam] splat 取り出し失敗:', e); }
    if(!packed || !n) continue;
    mesh.updateMatrixWorld(true);
    src.push({ packed, indices, n, m: mesh.matrixWorld.elements });
    total += n;
  }
  if(!total) return { points:null, count:0, meshes:0 };

  const stride = Math.max(1, Math.floor(total / target));
  const out = new Float32Array(Math.ceil(total / stride) * 3 + 3);
  let o = 0;
  for(const s of src){
    const { packed, indices, n, m } = s;
    for(let i = 0; i < n; i += stride){
      const idx = indices ? indices[i] : i;
      const b = idx * 4;
      if(b + 3 >= packed.length) continue;
      const w1 = packed[b + 1], w2 = packed[b + 2];
      const lx = _acFromHalf(w1 & 0xffff);
      const ly = _acFromHalf((w1 >>> 16) & 0xffff);
      const lz = _acFromHalf(w2 & 0xffff);
      if(!isFinite(lx) || !isFinite(ly) || !isFinite(lz)) continue;
      if(o + 3 > out.length) break;
      // matrixWorld（列優先）を手で掛ける。THREE.Vector3 を都度作らないため。
      out[o++] = m[0]*lx + m[4]*ly + m[8]*lz  + m[12];
      out[o++] = m[1]*lx + m[5]*ly + m[9]*lz  + m[13];
      out[o++] = m[2]*lx + m[6]*ly + m[10]*lz + m[14];
    }
  }
  return { points: out, count: (o / 3) | 0, meshes: src.length };
}

// ── 実行本体 ───────────────────────────────────────────────────
// 戻り値は 174 のエンジンの結果そのまま（confidence / needsReview / failed /
// position / yaw / pitch / diagnostics）。apply:false で「計算だけ」もできる。
window.computeAutoInitialView = function(opts){
  opts = opts || {};
  const eng = (typeof LocahunAutoCam !== 'undefined') ? LocahunAutoCam : null;
  if(!eng) return { failed:true, needsReview:true, confidence:0, reason:'engine-missing' };
  const s = _acCollectSplatPoints(opts.targetCount);
  if(!s.count) return { failed:true, needsReview:true, confidence:0, reason:'no-splats' };
  const r = eng.autoPlaceCamera(s.points, s.count, opts);
  r.splatMeshes = s.meshes;
  return r;
};

// 自動決定 → 初期視点へ反映（画質パネルの📍ボタンと同じ場所を書き換える）
window.applyAutoInitialView = function(result){
  if(!result || result.failed || !result.position) return false;
  _initCamPos.set(result.position.x, result.position.y, result.position.z);
  _initYaw = result.yaw; _initPitch = result.pitch;
  // 決めた視点をその場で見せる（確認できないと「効いたのか」が分からない）
  camPos.copy(_initCamPos);
  if(typeof setCamRotImmediate === 'function') setCamRotImmediate(_initYaw, _initPitch);
  else { yaw = _initYaw; pitch = _initPitch; }
  if(typeof markDirty === 'function') markDirty(10);
  return true;
};

// 信頼度に応じて色を変えるトースト。showUndoToast は色を持たないので、ここで
// 直接 #undo-toast の色を触り、表示が消える頃に既定色へ戻す（後続のトーストが
// 警告色のまま出てしまうのを防ぐ）。
let _acToastTimer = null;
function _acToast(msg, level){
  if(typeof showUndoToast === 'function') showUndoToast(msg);
  const el = document.getElementById('undo-toast');
  if(!el) return;
  const color = level === 'warn' ? '#ffcc66' : (level === 'error' ? '#ff8a80' : '');
  const border = level === 'warn' ? 'rgba(255,204,102,.45)' : (level === 'error' ? 'rgba(255,138,128,.45)' : '');
  el.style.color = color || 'rgba(200,200,200,.6)';
  if(border) el.style.borderColor = border;
  clearTimeout(_acToastTimer);
  _acToastTimer = setTimeout(()=>{
    el.style.color = 'rgba(200,200,200,.6)';
    el.style.borderColor = 'rgba(255,255,255,.15)';
  }, 4200);
}

// 🎯 ボタン(画質パネル最下部)の入口。UI からは戻り値を使わないが、?autoinit=1 のバッチ経路は
// 結果（信頼度・要確認）を必要とするので Promise で返す。
window.autoPlaceInitialView = async function(){
  const en = window._lang === 'en';
  if(typeof layers === 'undefined' || !layers.some(L=>L && L.type==='splat' && L.mesh)){
    _acToast(en ? 'No 3DGS scene loaded' : '3DGSシーンが読み込まれていません', 'error');
    return { failed:true, needsReview:true, confidence:0, reason:'no-scene' };
  }
  _acToast(en ? '🎯 Computing initial view…' : '🎯 初期位置を計算中…');
  // トーストを一度描画させてから重い計算に入る（同期実行だと「押しても無反応」
  // に見えるため）。
  await new Promise(r=>setTimeout(r, 30));
  let r;
  try { r = window.computeAutoInitialView(); }
  catch(e){
    console.error('[autocam]', e);
    _acToast((en ? 'Auto placement failed: ' : '自動配置に失敗しました: ') + e.message, 'error');
    return { failed:true, needsReview:true, confidence:0, reason:'exception: ' + e.message };
  }
  console.info('[autocam]', r);
  if(r.failed){
    _acToast(en
      ? `Auto placement failed (${r.reason}) — position unchanged`
      : `自動配置に失敗しました（${r.reason}）— 初期位置は変更していません`, 'error');
    return r;
  }
  window.applyAutoInitialView(r);
  if(r.needsReview){
    _acToast(en
      ? `Confidence ${r.confidence} — manual check recommended`
      : `信頼度 ${r.confidence} — 手動での確認を推奨します`, 'warn');
  } else {
    _acToast(en
      ? `Initial view set automatically (confidence ${r.confidence})`
      : `初期位置を自動設定しました（信頼度 ${r.confidence}）`);
  }
  return r;
};
