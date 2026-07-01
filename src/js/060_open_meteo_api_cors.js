// ══════════════════════════════════════════════════
//  実際の天気予報 (Open-Meteo・APIキー不要・CORS可・オンライン時のみ)
// ══════════════════════════════════════════════════
// 日照シミュの場所(sun.lat/lng)＋選択日付の毎時予報を取得し、選択時刻に応じた
// 天気/気温/雲量/降水/風を参照表示。さらに既存の天気トグル(clear/cloudy/rain)を
// 実際の予報に自動セットして光のムードも実天気に追従させる。キャッシュは sun._fc。
const _WMO_WX={
  0:{l:'快晴',le:'Clear',e:'☀',wx:'clear'},1:{l:'晴れ',le:'Mainly clear',e:'🌤',wx:'clear'},
  2:{l:'晴れ時々曇り',le:'Partly cloudy',e:'⛅',wx:'cloudy'},3:{l:'曇り',le:'Overcast',e:'☁',wx:'cloudy'},
  45:{l:'霧',le:'Fog',e:'🌫',wx:'cloudy'},48:{l:'霧氷',le:'Rime fog',e:'🌫',wx:'cloudy'},
  51:{l:'霧雨(弱)',le:'Light drizzle',e:'🌦',wx:'rain'},53:{l:'霧雨',le:'Drizzle',e:'🌦',wx:'rain'},55:{l:'霧雨(強)',le:'Heavy drizzle',e:'🌧',wx:'rain'},
  56:{l:'着氷性霧雨',le:'Freezing drizzle',e:'🌧',wx:'rain'},57:{l:'着氷性霧雨(強)',le:'Heavy freezing drizzle',e:'🌧',wx:'rain'},
  61:{l:'雨(弱)',le:'Light rain',e:'🌦',wx:'rain'},63:{l:'雨',le:'Rain',e:'🌧',wx:'rain'},65:{l:'雨(強)',le:'Heavy rain',e:'🌧',wx:'rain'},
  66:{l:'着氷性の雨',le:'Freezing rain',e:'🌧',wx:'rain'},67:{l:'着氷性の雨(強)',le:'Heavy freezing rain',e:'🌧',wx:'rain'},
  71:{l:'雪(弱)',le:'Light snow',e:'🌨',wx:'cloudy'},73:{l:'雪',le:'Snow',e:'🌨',wx:'cloudy'},75:{l:'雪(強)',le:'Heavy snow',e:'❄',wx:'cloudy'},77:{l:'霧雪',le:'Snow grains',e:'🌨',wx:'cloudy'},
  80:{l:'にわか雨(弱)',le:'Light showers',e:'🌦',wx:'rain'},81:{l:'にわか雨',le:'Showers',e:'🌧',wx:'rain'},82:{l:'にわか雨(激)',le:'Violent showers',e:'⛈',wx:'rain'},
  85:{l:'にわか雪',le:'Snow showers',e:'🌨',wx:'cloudy'},86:{l:'にわか雪(強)',le:'Heavy snow showers',e:'🌨',wx:'cloudy'},
  95:{l:'雷雨',le:'Thunderstorm',e:'⛈',wx:'rain'},96:{l:'雷雨(雹)',le:'Thunderstorm w/ hail',e:'⛈',wx:'rain'},99:{l:'雷雨(雹/激)',le:'Severe thunderstorm w/ hail',e:'⛈',wx:'rain'},
};
function _wmoWx(code){ return _WMO_WX[code] || {l:'天気不明('+code+')',le:'Unknown ('+code+')',e:'🌡',wx:'cloudy'}; }
function _wmoLabel(w){ return (window._lang==='en' && w.le) ? w.le : w.l; }
function _sunDateStr(){ return sun.y+'-'+String(sun.mo).padStart(2,'0')+'-'+String(sun.d).padStart(2,'0'); }
function _sunFcKey(){ return _sunDateStr()+'@'+sun.lat.toFixed(2)+','+sun.lng.toFixed(2); }
function _sunFcShow(html, on){ const el=document.getElementById('sun-forecast'); if(!el) return; el.innerHTML=html; el.style.display=on?'block':'none'; }

function _sunFcSyncButtons(){ document.querySelectorAll('#sun-panel .sun-wx-btn').forEach(b=>b.classList.toggle('on', b.dataset.wx===sun.weather)); }
// キャッシュ済み予報から「現在の日付/場所/時刻」の天気種別(clear/cloudy/rain)を返す。無ければnull。
function _sunFcWeatherForNow(){
  const fc=sun._fc;
  if(!fc||!fc.hourly||!fc.hourly.time) return null;
  if(fc.keyLoc!==(sun.lat.toFixed(2)+','+sun.lng.toFixed(2))) return null;
  const dstr=_sunDateStr();
  if(dstr<fc.start || dstr>fc.end) return null;
  const h=Math.max(0,Math.min(23,Math.round(sun.timeMin/60)));
  const idx=fc.hourly.time.indexOf(dstr+'T'+String(h).padStart(2,'0')+':00');
  if(idx<0) return null;
  const code=(fc.hourly.weather_code&&fc.hourly.weather_code[idx]!=null)?fc.hourly.weather_code[idx]:null;
  if(code==null) return null;
  return _wmoWx(code).wx;
}
// 雨を3段階に分類: 1=霧雨 / 2=雨 / 3=豪雨。WMO weather_code を主、毎時降水量(mm)で補強。
function _rainLevelFromCodePrecip(code, pr){
  let lvl;
  if([51,53,55,56,57,61,80].includes(code))      lvl = 1;  // 霧雨・弱い雨・弱いにわか雨
  else if([63,66,81].includes(code))             lvl = 2;  // 雨・にわか雨
  else if([65,67,82,95,96,99].includes(code))    lvl = 3;  // 強い雨・激しいにわか雨・雷雨
  else                                           lvl = 2;
  // 降水量(mm/h)で上方修正（コードが弱めでも実降水が多ければ格上げ）。
  if(typeof pr === 'number'){
    if(pr >= 6)        lvl = Math.max(lvl, 3);
    else if(pr >= 1.5) lvl = Math.max(lvl, 2);
  }
  return Math.max(1, Math.min(3, lvl));
}
// 予報キャッシュから現在の日付/場所/時刻に対応する {wx, cloudAmt(0..1), rainLevel(1..3)} を返す。無ければnull。
function _sunFcDetailForNow(){
  const fc=sun._fc;
  if(!fc||!fc.hourly||!fc.hourly.time) return null;
  if(fc.keyLoc!==(sun.lat.toFixed(2)+','+sun.lng.toFixed(2))) return null;
  const dstr=_sunDateStr();
  if(dstr<fc.start || dstr>fc.end) return null;
  const h=Math.max(0,Math.min(23,Math.round(sun.timeMin/60)));
  const idx=fc.hourly.time.indexOf(dstr+'T'+String(h).padStart(2,'0')+':00');
  if(idx<0) return null;
  const hh=fc.hourly;
  const code=(hh.weather_code&&hh.weather_code[idx]!=null)?hh.weather_code[idx]:null;
  if(code==null) return null;
  let wx=_wmoWx(code).wx;
  // ★雲量は天気分類に関係なく常に cloud_cover% から取る（晴れでも雨でも雲は存在する）。
  const cc=(hh.cloud_cover&&hh.cloud_cover[idx]!=null)?hh.cloud_cover[idx]:null;
  let cloudAmt = (cc!=null) ? Math.max(0,Math.min(1, cc/100)) : null;
  let rainLevel=null, snowLevel=null, precipType=null;
  const SNOW={71:1,77:1,85:1,73:2,75:3,86:3};   // WMO雪コード→強度
  if(SNOW[code]!=null){
    wx='snow'; snowLevel=SNOW[code]; precipType='snow';
    if(cloudAmt==null || cloudAmt<0.6) cloudAmt=0.9;   // 雪は厚い雲
  } else if(code===96 || code===99){
    wx='rain'; precipType='hail'; rainLevel=3;          // 雷雨＋雹 → 暗い雨空＋雹
    if(cloudAmt==null) cloudAmt=0.95;
  } else if(wx==='rain'){
    const pr=(hh.precipitation&&hh.precipitation[idx]!=null)?hh.precipitation[idx]:null;
    rainLevel = _rainLevelFromCodePrecip(code, pr); precipType='rain';
    if(cloudAmt==null) cloudAmt = 0.9;          // 雨で雲量欠損 → 厚め
  } else if(wx==='cloudy' && cloudAmt==null){
    cloudAmt = 0.85;                            // 霧(45/48)など雲量欠損 → 厚め
  } else if(cloudAmt==null){
    cloudAmt = 0;                               // 晴れで雲量欠損 → 雲なし
  }
  // ★気象庁の雲量基準で「晴れ/曇り」を再判定（雲量で決まる code 0-3 のみ）。
  //   快晴=雲量0-1 / 晴れ=2-8(15-85%) / 曇り=9-10(85%超)。WMOの partly-cloudy(=晴れ)を
  //   灰色の曇り扱いにしていたズレを是正。雨・雪・霧はそのまま。
  if(code>=0 && code<=3 && cloudAmt!=null){
    wx = (cloudAmt > 0.85) ? 'cloudy' : 'clear';
  }
  return { wx, cloudAmt, rainLevel, snowLevel, precipType };
}
// 自動モード中、現在の日時に対応する予報の天気＋強度(雲量/雨レベル)を sun に反映。
// updateSunMode を呼ばず直接書き換える（onSunWeather経由だと再帰するため）。
function _sunFcApplyAuto(){
  if(!sun._fcAuto) return;
  const d=_sunFcDetailForNow();
  if(!d || !d.wx) return;
  // 強度は予報の現在時刻の値に毎回更新（該当しない時刻は null に戻す）。
  sun._fcCloudAmt  = d.cloudAmt;
  sun._fcRainLevel = d.rainLevel;
  sun._fcSnowLevel = d.snowLevel;
  sun._fcPrecip    = d.precipType;
  if(d.wx!==sun.weather){ sun.weather=d.wx; _sunFcSyncButtons(); }
}

// キャッシュ済み予報から、現在の日付/場所/時刻に対応する行を表示。
// applyWeather=true のとき天気トグル(clear/cloudy/rain)も実天気に合わせる。
function _sunFcReadout(){
  const fc=sun._fc;
  if(!fc || !fc.hourly || !fc.hourly.time) return;
  const loc=sun.lat.toFixed(2)+','+sun.lng.toFixed(2);
  if(fc.keyLoc!==loc){ _sunFcShow('', false); return; }   // 別の場所のキャッシュ → 隠す
  const dstr=_sunDateStr();
  if(dstr<fc.start || dstr>fc.end){
    _sunFcShow((window._lang==='en')
      ? '📅 Outside the fetched range (±1 week of the fetch date). Tap “Get forecast” again.'
      : '📅 取得した期間（取得日の前後1週間）の範囲外です。もう一度「取得」してください。', true);
    return;
  }
  const h=Math.max(0,Math.min(23, Math.round(sun.timeMin/60)));
  const target=dstr+'T'+String(h).padStart(2,'0')+':00';
  const idx=fc.hourly.time.indexOf(target);
  if(idx<0){ _sunFcShow('', false); return; }
  const hh=fc.hourly;
  const code=(hh.weather_code&&hh.weather_code[idx]!=null)?hh.weather_code[idx]:null;
  if(code==null) return;
  const w=_wmoWx(code);
  const t =(hh.temperature_2m&&hh.temperature_2m[idx]!=null)?Math.round(hh.temperature_2m[idx]):null;
  const cc=(hh.cloud_cover&&hh.cloud_cover[idx]!=null)?Math.round(hh.cloud_cover[idx]):null;
  const pr=(hh.precipitation&&hh.precipitation[idx]!=null)?hh.precipitation[idx]:null;
  const ws=(hh.wind_speed_10m&&hh.wind_speed_10m[idx]!=null)?Math.round(hh.wind_speed_10m[idx]):null;
  const place=SUN_CITIES[sun.city]?(window._lang==='en'?SUN_CITIES[sun.city].en:SUN_CITIES[sun.city].ja):'';
  const en=(window._lang==='en');
  // Source / timestamp line removed per user request (panel de-clutter).
  void place;
  _sunFcShow(
    '<div style="font-weight:600;color:#cfe;font-size:1.05em">'+w.e+' '+_wmoLabel(w)+(t!=null?'　'+t+'°C':'')+'</div>'+
    '<div style="color:#9bd;margin-top:1px">'+
      (cc!=null?(en?'Cloud ':'雲量 ')+cc+'%　':'')+
      (pr!=null?(en?'Precip ':'降水 ')+pr+'mm　':'')+
      (ws!=null?(en?'Wind ':'風 ')+ws+'km/h':'')+'</div>',
    true);
}

window.fetchSunForecast = async function(){
  const btn=document.getElementById('sun-fetch-wx');
  if(typeof navigator!=='undefined' && navigator.onLine===false){
    _sunFcShow('⚠ オフラインです。天気予報の取得にはインターネット接続が必要です。', true);
    return;
  }
  // 取得日の前後1週間（計15日）をまとめて取得してキャッシュ。以後はパラメータ
  // （日付/時刻）を動かしてもこのキャッシュから参照を続ける（再取得は範囲外/場所変更時のみ）。
  const center=new Date(sun.y, sun.mo-1, sun.d);
  const fmt=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const sdD=new Date(center); sdD.setDate(sdD.getDate()-7);
  const edD=new Date(center); edD.setDate(edD.getDate()+7);
  const sd=fmt(sdD), ed=fmt(edD);
  const loc=sun.lat.toFixed(2)+','+sun.lng.toFixed(2);
  if(btn) btn.disabled=true;
  _sunFcShow('🌐 取得中…（前後1週間ぶん）', true);
  try{
    const url='https://api.open-meteo.com/v1/forecast?latitude='+sun.lat+'&longitude='+sun.lng+
      '&hourly=temperature_2m,weather_code,cloud_cover,precipitation,wind_speed_10m&timezone=auto&start_date='+sd+'&end_date='+ed;
    const r=await fetch(url, {mode:'cors'});
    if(!r.ok){
      let reason='';
      try{ const ej=await r.json(); reason=(ej&&ej.reason)?ej.reason:''; }catch(_){}
      if(r.status===400 || /range|out of|date/i.test(reason)){
        _sunFcShow('⚠ この日付の前後1週間が予報の対象範囲外です（天気予報は約16日先まで、過去は数か月前まで）。', true);
      } else {
        _sunFcShow('⚠ 予報の取得に失敗しました（HTTP '+r.status+(reason?'：'+reason:'')+'）。', true);
      }
      sun._fc=null; return;
    }
    const j=await r.json();
    if(!j.hourly || !j.hourly.time || !j.hourly.time.length){
      _sunFcShow('⚠ この期間の予報データがありません（予報は約16日先まで、過去は数か月前まで）。', true);
      sun._fc=null; return;
    }
    sun._fcAuto=true;      // 以後、日時を動かすたびに予報の天気を自動適用
    sun._fc={ keyLoc:loc, start:sd, end:ed, hourly:j.hourly };
    if(typeof _sunFcApplyAuto==='function') _sunFcApplyAuto();   // 取得時点の天気を反映
    if(sun.active && typeof updateSunMode==='function') updateSunMode();  // 光を再計算
    _sunFcReadout();       // 参照表示（日照OFFでも表示）
  }catch(e){
    _sunFcShow('⚠ 予報の取得に失敗しました（'+((e&&e.message)||e)+'）。接続環境をご確認ください。', true);
    sun._fc=null;
  }finally{
    if(btn) btn.disabled=false;
  }
};

// ── カスタムカレンダー ──
const _sunCalView = { y:null, mo:null };
window.sunCalToggle = function(){
  const cal=document.getElementById('sun-calendar'); if(!cal) return;
  const open = cal.style.display==='none';
  cal.style.display = open ? 'block' : 'none';
  if(open){ _sunCalView.y=sun.y; _sunCalView.mo=sun.mo; _sunRenderCalendar(); }
};
window.sunCalNav = function(delta){
  let m=_sunCalView.mo+delta, y=_sunCalView.y;
  while(m<1){ m+=12; y--; } while(m>12){ m-=12; y++; }
  _sunCalView.y=y; _sunCalView.mo=m; _sunRenderCalendar();
};
window.sunCalSelect = function(y,mo,d){
  sun.y=y; sun.mo=mo; sun.d=d;
  const cal=document.getElementById('sun-calendar'); if(cal) cal.style.display='none';
  _sunSyncForm(); updateSunMode();
};
function _sunRenderCalendar(){
  const cal=document.getElementById('sun-calendar'); if(!cal) return;
  const y=_sunCalView.y, mo=_sunCalView.mo, en=window._lang==='en';
  const MON = en ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
                 : ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const WD  = en ? ['Su','Mo','Tu','We','Th','Fr','Sa'] : ['日','月','火','水','木','金','土'];
  const first=new Date(y,mo-1,1).getDay(), days=new Date(y,mo,0).getDate(), t=new Date();
  let h=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
    <button class="sun-cal-nav" onclick="sunCalNav(-1)">◀</button>
    <strong style="color:#cfcfcf">${en?MON[mo-1]+' '+y:y+'年 '+MON[mo-1]}</strong>
    <button class="sun-cal-nav" onclick="sunCalNav(1)">▶</button></div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center">`;
  for(let i=0;i<7;i++) h+=`<div style="color:${i===0?'#e88':i===6?'#8ae':'#777'};font-size:.85em;padding:2px 0">${WD[i]}</div>`;
  for(let i=0;i<first;i++) h+='<div></div>';
  for(let d=1;d<=days;d++){
    const sel=(y===sun.y&&mo===sun.mo&&d===sun.d), today=(y===t.getFullYear()&&mo===t.getMonth()+1&&d===t.getDate());
    const dow=(first+d-1)%7, col=dow===0?'#e88':dow===6?'#8ae':'#cfcfcf';
    h+=`<button class="sun-cal-d${sel?' sel':''}${today?' today':''}" style="color:${col}" onclick="sunCalSelect(${y},${mo},${d})">${d}</button>`;
  }
  cal.innerHTML=h+'</div>';
}

// sun.state → フォーム表示を同期
function _sunSyncForm(){
  const cs=document.getElementById('sun-city'); if(cs) cs.value=sun.city;
  _sunUpdateCoords();
  document.querySelectorAll('#sun-panel .sun-wx-btn').forEach(b=>b.classList.toggle('on', b.dataset.wx===sun.weather));
  const db=document.getElementById('sun-date-btn');
  if(db) db.textContent = sun.y+'-'+String(sun.mo).padStart(2,'0')+'-'+String(sun.d).padStart(2,'0');
  const ts=document.getElementById('sun-time'); if(ts) ts.value=sun.timeMin;
  const cal=document.getElementById('sun-calendar');
  if(cal && cal.style.display!=='none'){ _sunCalView.y=sun.y; _sunCalView.mo=sun.mo; _sunRenderCalendar(); }
}
// 都市ドロップダウンを現在言語で翻訳（SUN_CITIES とDRY）。applyI18n から呼ぶ。
function _sunApplyCityI18n(){
  const lang = (window._lang==='en') ? 'en' : 'ja';
  const sel = document.getElementById('sun-city');
  if(sel){ for(const opt of sel.options){ const c=SUN_CITIES[opt.value]; if(c) opt.textContent=c[lang]; } }
  _sunUpdateCoords();
  const cal=document.getElementById('sun-calendar');
  if(cal && cal.style.display!=='none') _sunRenderCalendar();
}

