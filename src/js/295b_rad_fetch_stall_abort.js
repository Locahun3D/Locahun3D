// ══════════════════════════════════════════════════
//  RAD RANGE FETCH STALL ABORT (2026-11-10, 内見版 296_rad_fetch_stall_abort.js 8db3d75 を元に、ヘッダー待ちの打ち切り条件を追加)
//  2026-11-10: 本体・内見とも組み込みを外した（PC で正常な取得まで切って遅くなった。複数端末での互換性を優先し、打ち切らない 295 の重複取得だけにする）。
//  実機 iPhone (iOS 27.2 Safari) では開いた直後に毎回、RAD の Range 取得が数本止まる（データが1バイトも来ない）。
//  295_lod_fetch_watchdog.js は「10秒たっても終わらない取得」を見限るため、その10秒がそのまま初回表示の遅れになっていた。
//  ここでは時間ではなく「データが STALL_MS 来ない」ことで止まりを見分け、その取得だけを中断する。
//  中断すると Spark の fetchRange が AbortError で失敗し、Spark 自身が 0.25〜0.75 秒待って同じ塊を取り直す。
//  遅い回線でもデータが少しずつ届いている限り打ち切らない（時間で切ると正常な取得まで切ってしまう）。
//  Spark は呼ぶたびに global の fetch を引くので、window.fetch を包むだけで済む（vendor は変更しない）。
(function(){
  if(/[?&]nostallabort=1/.test(location.search)) return;   // 比較試験用
  const STALL_MS = 5000;   // 応答ヘッダー・本文とも、これだけデータが来なければ止まったとみなす
  const st = { aborted: 0, noHeader: 0, midBody: 0, active: 0, deferred: 0 };
  // 応答ヘッダー待ちの打ち切りは「回線全体が黙っている」か「後から出した取得がもう応答を受けた」ときだけ。
  // 本体のPC版は並列16本で、HTTP/1.1 や遅い回線では順番待ちの取得がヘッダーを5秒以上待つのが普通のため
  // （試験: 1MB/s・HTTP/1.1 で打ち切りが56回続き、点数が32万で止まった）。
  let seq = 0, lastDataAt = 0, maxHeaderSeq = -1;
  window.__radFetchStall = st;   // diag 用
  const origFetch = window.fetch;
  if(typeof origFetch !== 'function' || origFetch.__radStall) return;

  function isRadRange(input){
    if(!(input instanceof Request) || input.method !== 'GET' || !input.headers.has('Range')) return false;
    try { return /\.rad$/i.test(new URL(input.url).pathname); } catch(_){ return false; }
  }

  const wrapped = function(input, init){
    if(init !== undefined || !isRadRange(input)) return origFetch.apply(this, arguments);
    const ctl = new AbortController();
    const outer = input.signal;
    const onOuter = () => ctl.abort(outer.reason);
    if(outer){ if(outer.aborted) ctl.abort(outer.reason); else outer.addEventListener('abort', onOuter, { once: true }); }
    let timer = 0, phase = 'header', fin = false; const mySeq = seq++;
    const done = () => { clearTimeout(timer); if(fin) return; fin = true; st.active--; if(outer) outer.removeEventListener('abort', onOuter); };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // 本文の途中は「回線全体が黙っている」ときだけ切る（2026-11-10: PC=並列16本・HTTP/2 では、正常な取得も
        // 本文の途中で5秒以上待たされる。本番で20秒に24回切って取り直し、表示が遅くなった）
        const quiet = performance.now() - lastDataAt >= STALL_MS;
        if(!quiet && (phase === 'body' || maxHeaderSeq <= mySeq)){ st.deferred++; arm(); return; }
        st.aborted++; if(phase === 'header') st.noHeader++; else st.midBody++;
        console.warn('[rad-stall] no data for', STALL_MS / 1000 + 's (' + phase + '), abort', input.headers.get('Range'));
        ctl.abort(new DOMException('rad range stalled', 'AbortError'));
      }, STALL_MS);
    };
    st.active++; arm();
    let req;
    try { req = new Request(input, { signal: ctl.signal }); } catch(e){ done(); return origFetch.call(this, input); }
    return origFetch.call(this, req).then(res => {
      lastDataAt = performance.now(); if(mySeq > maxHeaderSeq) maxHeaderSeq = mySeq;
      if(!res.ok || !res.body){ done(); return res; }
      phase = 'body'; arm();
      const reader = res.body.getReader();
      const body = new ReadableStream({
        async pull(c){
          try {
            const { done: end, value } = await reader.read();
            if(end){ done(); c.close(); return; }
            lastDataAt = performance.now(); arm(); c.enqueue(value);
          } catch(e){ done(); c.error(e); }
        },
        cancel(reason){ done(); return reader.cancel(reason); }
      });
      return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
    }, e => { done(); throw e; });
  };
  wrapped.__radStall = true;
  window.fetch = wrapped;
})();
