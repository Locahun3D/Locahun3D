// ══════════════════════════════════════════════════
//  RAD LOD FETCH WATCHDOG (2026-11-10)
//  実機 iPhone (iOS 27.2 Safari) で、Spark pager の fetchDecodeChunk の promise が
//  終わらないまま残り（chunk 11/5/7 の3本）、LOD がその chunk を待ち続けて
//  点数が 647,128 のまま8分止まった。同じ chunk を取り直すと 240ms で成功し、
//  pager.driveFetchers() を呼ぶと 51/51 そろって約100万点まで増えた。
//  → 一定時間終わらない取得を「止まった」とみなし、同じ chunk を取り直させる。
//
//  Spark 側の fetcher は finally で fetchers.indexOf(fetcher) を使って自分を外すため、
//  配列から直接消すと遅れて終わったときに別の fetcher を外してしまう。
//  そこで止まった fetcher は配列に残したまま chunk を -1 に変え（driveFetchers が
//  「取得中」と数えなくなる）、その分だけ numFetchers を一時的に増やして並列数を保つ。
//  遅れて届いた結果は、すでにページがある chunk なら fetched.push で捨てる（ページの二重確保を防ぐ）。
//  vendor の Spark（固定URL・ハッシュ検証つき）は変更しない。
//
//  止まりの判定（2026-11-10 改: 実機 iPhone は開いた直後に毎回数本止まり、固定10〜12秒待ちが初回表示の遅れになっていた）:
//   ・後から始まった取得がもう終わっているのに、自分だけ MIN_MS 以上かつ最近の所要時間の SLOW_X 倍以上かかっている
//     → 止まったとみなす（一様に遅い回線では、後発も終わらないので誤判定しない）
//   ・それでも HARD_MS（遅い回線では所要時間中央値の3倍）を超えたら止まったとみなす
//  見限った取得は abort しないので、元の取得が先に届けばそれが使われ、取り直しは捨てられる（実質「保険の重複取得」）。
(function(){
  if(/[?&]nowatchdog=1/.test(location.search)) return;   // 比較試験用
  const MIN_MS  = +(new URLSearchParams(location.search).get('wdmin')) || 1000;     // これより短い取得は止まり扱いしない（2026-11-10: 2.5秒→1秒。通常の取得は0.2秒前後、iPhone 実機で収束5秒→短縮狙い）
  const SLOW_X  = 4;        // 最近の所要時間（中央値）の何倍で止まりとみなすか
  const HARD_MS = 12000;    // 後発の完了が無くても、これを超えたら止まりとみなす
  const TICK_MS = 250;
  const MAX_BOOST = 8;      // 並列数の上乗せ上限
  const st = { stalls: 0, late: 0, dropped: 0, boost: 0, base: 0, lastSet: 0, medianMs: 0 };
  window.__lodFetchWatchdog = st;   // diag 用
  const seen = new WeakMap();       // fetcher → 最初に見た時刻
  const stale = new Set();          // 止まったとみなした fetcher
  let active = new Set();           // 前回見えていた（止まり扱いでない）fetcher
  const durs = [];                  // 最近終わった取得の所要時間
  let lastDoneStart = -1;           // 終わった取得のうち、最も遅く始まったものの開始時刻

  function guardFetched(pg){
    if(pg.__nkFetchGuard) return;
    const arr = pg.fetched;
    if(!Array.isArray(arr)) return;
    arr.push = function(...items){
      for(const it of items){
        const dup = it && (pg.getSplatsChunk(it.splats, it.chunk) ||
          Array.prototype.some.call(this, x => x.splats === it.splats && x.chunk === it.chunk));
        if(dup){ st.dropped++; continue; }
        Array.prototype.push.call(this, it);
      }
      return this.length;
    };
    pg.__nkFetchGuard = true;
  }

  function tick(){
    const sr = (typeof sparkRenderer !== 'undefined' && sparkRenderer) ? sparkRenderer : null;
    const pg = sr && sr.pager;
    if(!pg || !Array.isArray(pg.fetchers)) return;
    guardFetched(pg);
    const now = performance.now();
    // アプリ側が numFetchers を変えたら、それを新しい基準にする
    if(pg.numFetchers !== st.lastSet){ st.base = pg.numFetchers; st.boost = 0; }

    // 遅れて終わった（配列から消えた）止まり fetcher を片付ける
    for(const f of stale){ if(!pg.fetchers.includes(f)){ stale.delete(f); st.late++; } }

    // 普通に終わった取得の所要時間を記録
    const cur = new Set(pg.fetchers);
    for(const f of active){
      if(cur.has(f) || stale.has(f)) continue;
      const t = seen.get(f);
      if(t !== undefined){
        durs.push(now - t); if(durs.length > 24) durs.shift();
        if(t > lastDoneStart) lastDoneStart = t;
      }
    }
    if(durs.length){ const s = durs.slice().sort((a, b) => a - b); st.medianMs = Math.round(s[s.length >> 1]); }
    active = new Set();

    let found = false;
    for(const f of pg.fetchers){
      if(stale.has(f)) continue;
      active.add(f);
      const t = seen.get(f);
      if(t === undefined){ seen.set(f, now); continue; }
      const age = now - t;
      const overtaken = lastDoneStart >= t &&   // 同時に始まった取得が先に終わった場合も含む
        age > MIN_MS && age > SLOW_X * (st.medianMs || 0);
      if(overtaken || age > Math.max(HARD_MS, 3 * (st.medianMs || 0))){
        active.delete(f);
        console.warn('[lod-watchdog] fetch stalled', Math.round((now - t) / 1000) + 's', 'chunk', f.chunk, '→ retry');
        f.chunk = -1;           // driveFetchers がこの chunk を取得中と数えないようにする
        stale.add(f); st.stalls++; found = true;
      }
    }
    const boost = Math.min(stale.size, MAX_BOOST);
    if(boost !== st.boost || pg.numFetchers !== st.base + boost){
      st.boost = boost;
      pg.numFetchers = st.base + boost;
    }
    st.lastSet = pg.numFetchers;
    if(found && sr.enableLodFetching !== false){
      try { pg.driveFetchers(); } catch(e){ console.warn('[lod-watchdog] driveFetchers', e); }
      if(typeof markDirty === 'function') markDirty(240);
      if(typeof window.__keepAlive === 'function') window.__keepAlive(6000);
    }
  }
  setInterval(tick, TICK_MS);
})();
