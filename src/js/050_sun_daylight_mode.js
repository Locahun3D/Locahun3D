// ══════════════════════════════════════════════════
//  日照 (SUN / DAYLIGHT) MODE
// ══════════════════════════════════════════════════
// サン・サーベイヤー的な「年月日時＋場所 → 太陽位置・日照時間」。
// おおよその光のムード再現が目的（厳密な日影解析ではない）。
// 既存の環境(env)ステートマシンに合流させ、太陽高度から動的プリセット
// ENV_PRESETS.__sun を毎更新で書き換える。これにより sceneTint /
// ドームシェーダー / 写真焼き込み がすべて無改造で機能する。
// 太陽ディスク/グローは uShowSun/uSunDir/uSunColor/uSunGlow で描画。

// ── インライン SunCalc (MIT, mourner/suncalc を圧縮) ──
const SunCalc = (function(){
  const PI=Math.PI, rad=PI/180, dayMs=86400000, J1970=2440588, J2000=2451545;
  const e=rad*23.4397;
  const toDays = d => (d.valueOf()/dayMs - 0.5 + J1970) - J2000;
  const rightAscension = (l,b)=>Math.atan2(Math.sin(l)*Math.cos(e)-Math.tan(b)*Math.sin(e), Math.cos(l));
  const declination    = (l,b)=>Math.asin(Math.sin(b)*Math.cos(e)+Math.cos(b)*Math.sin(e)*Math.sin(l));
  const azimuth  = (H,phi,dec)=>Math.atan2(Math.sin(H), Math.cos(H)*Math.sin(phi)-Math.tan(dec)*Math.cos(phi));
  const altitude = (H,phi,dec)=>Math.asin(Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(H));
  const siderealTime = (d,lw)=>rad*(280.16+360.9856235*d)-lw;
  const solarMeanAnomaly = d=>rad*(357.5291+0.98560028*d);
  const eclipticLongitude = M=>{const C=rad*(1.9148*Math.sin(M)+0.02*Math.sin(2*M)+0.0003*Math.sin(3*M)); return M+C+rad*102.9372+PI;};
  const sunCoords = d=>{const M=solarMeanAnomaly(d), L=eclipticLongitude(M); return {dec:declination(L,0), ra:rightAscension(L,0), M, L};};
  const J0=0.0009;
  const julianCycle  = (d,lw)=>Math.round(d-J0-lw/(2*PI));
  const approxTransit= (Ht,lw,n)=>J0+(Ht+lw)/(2*PI)+n;
  const solarTransitJ= (ds,M,L)=>J2000+ds+0.0053*Math.sin(M)-0.0069*Math.sin(2*L);
  const hourAngle    = (h,phi,d)=>Math.acos((Math.sin(h)-Math.sin(phi)*Math.sin(d))/(Math.cos(phi)*Math.cos(d)));
  const fromJulian   = j=>new Date((j+0.5-J1970)*dayMs);
  const TIMES=[[-0.833,'sunrise','sunset'],[-6,'dawn','dusk'],[-12,'nauticalDawn','nauticalDusk'],[-18,'nightEnd','night'],[6,'goldenHourEnd','goldenHour']];
  return {
    getPosition(date,lat,lng){
      const lw=rad*-lng, phi=rad*lat, d=toDays(date), c=sunCoords(d), H=siderealTime(d,lw)-c.ra;
      return {azimuth:azimuth(H,phi,c.dec), altitude:altitude(H,phi,c.dec)};
    },
    getTimes(date,lat,lng){
      const lw=rad*-lng, phi=rad*lat, d=toDays(date), n=julianCycle(d,lw), ds=approxTransit(0,lw,n),
            M=solarMeanAnomaly(ds), L=eclipticLongitude(M), dec=declination(L,0), Jnoon=solarTransitJ(ds,M,L),
            res={solarNoon:fromJulian(Jnoon), nadir:fromJulian(Jnoon-0.5)};
      for(const t of TIMES){
        const w=hourAngle(t[0]*rad,phi,dec), Jset=solarTransitJ(approxTransit(w,lw,n),M,L);
        res[t[2]]=fromJulian(Jset); res[t[1]]=fromJulian(Jnoon-(Jset-Jnoon));
      }
      return res;
    }
  };
})();

// ── 都市プリセット (lat, lng, tz=UTCオフセット時間) ──
// 47都道府県（緯度経度=県庁所在地）。日本標準時=UTC+9固定。JIS順(北→南)。
const SUN_CITIES = {
  hokkaido:  { ja:'北海道',   en:'Hokkaido',   lat:43.06, lng:141.35, tz:9 },
  aomori:    { ja:'青森県',   en:'Aomori',     lat:40.82, lng:140.74, tz:9 },
  iwate:     { ja:'岩手県',   en:'Iwate',      lat:39.70, lng:141.15, tz:9 },
  miyagi:    { ja:'宮城県',   en:'Miyagi',     lat:38.27, lng:140.87, tz:9 },
  akita:     { ja:'秋田県',   en:'Akita',      lat:39.72, lng:140.10, tz:9 },
  yamagata:  { ja:'山形県',   en:'Yamagata',   lat:38.24, lng:140.36, tz:9 },
  fukushima: { ja:'福島県',   en:'Fukushima',  lat:37.75, lng:140.47, tz:9 },
  ibaraki:   { ja:'茨城県',   en:'Ibaraki',    lat:36.34, lng:140.45, tz:9 },
  tochigi:   { ja:'栃木県',   en:'Tochigi',    lat:36.57, lng:139.88, tz:9 },
  gunma:     { ja:'群馬県',   en:'Gunma',      lat:36.39, lng:139.06, tz:9 },
  saitama:   { ja:'埼玉県',   en:'Saitama',    lat:35.86, lng:139.65, tz:9 },
  chiba:     { ja:'千葉県',   en:'Chiba',      lat:35.61, lng:140.12, tz:9 },
  tokyo:     { ja:'東京都',   en:'Tokyo',      lat:35.69, lng:139.69, tz:9 },
  kanagawa:  { ja:'神奈川県', en:'Kanagawa',   lat:35.45, lng:139.64, tz:9 },
  niigata:   { ja:'新潟県',   en:'Niigata',    lat:37.90, lng:139.02, tz:9 },
  toyama:    { ja:'富山県',   en:'Toyama',     lat:36.70, lng:137.21, tz:9 },
  ishikawa:  { ja:'石川県',   en:'Ishikawa',   lat:36.59, lng:136.63, tz:9 },
  fukui:     { ja:'福井県',   en:'Fukui',      lat:36.07, lng:136.22, tz:9 },
  yamanashi: { ja:'山梨県',   en:'Yamanashi',  lat:35.66, lng:138.57, tz:9 },
  nagano:    { ja:'長野県',   en:'Nagano',     lat:36.65, lng:138.18, tz:9 },
  gifu:      { ja:'岐阜県',   en:'Gifu',       lat:35.42, lng:136.76, tz:9 },
  shizuoka:  { ja:'静岡県',   en:'Shizuoka',   lat:34.98, lng:138.38, tz:9 },
  aichi:     { ja:'愛知県',   en:'Aichi',      lat:35.18, lng:136.91, tz:9 },
  mie:       { ja:'三重県',   en:'Mie',        lat:34.73, lng:136.51, tz:9 },
  shiga:     { ja:'滋賀県',   en:'Shiga',      lat:35.00, lng:135.87, tz:9 },
  kyoto:     { ja:'京都府',   en:'Kyoto',      lat:35.02, lng:135.76, tz:9 },
  osaka:     { ja:'大阪府',   en:'Osaka',      lat:34.69, lng:135.52, tz:9 },
  hyogo:     { ja:'兵庫県',   en:'Hyogo',      lat:34.69, lng:135.18, tz:9 },
  nara:      { ja:'奈良県',   en:'Nara',       lat:34.69, lng:135.83, tz:9 },
  wakayama:  { ja:'和歌山県', en:'Wakayama',   lat:34.23, lng:135.17, tz:9 },
  tottori:   { ja:'鳥取県',   en:'Tottori',    lat:35.50, lng:134.24, tz:9 },
  shimane:   { ja:'島根県',   en:'Shimane',    lat:35.47, lng:133.05, tz:9 },
  okayama:   { ja:'岡山県',   en:'Okayama',    lat:34.66, lng:133.93, tz:9 },
  hiroshima: { ja:'広島県',   en:'Hiroshima',  lat:34.40, lng:132.46, tz:9 },
  yamaguchi: { ja:'山口県',   en:'Yamaguchi',  lat:34.19, lng:131.47, tz:9 },
  tokushima: { ja:'徳島県',   en:'Tokushima',  lat:34.07, lng:134.56, tz:9 },
  kagawa:    { ja:'香川県',   en:'Kagawa',     lat:34.34, lng:134.04, tz:9 },
  ehime:     { ja:'愛媛県',   en:'Ehime',      lat:33.84, lng:132.77, tz:9 },
  kochi:     { ja:'高知県',   en:'Kochi',      lat:33.56, lng:133.53, tz:9 },
  fukuoka:   { ja:'福岡県',   en:'Fukuoka',    lat:33.61, lng:130.42, tz:9 },
  saga:      { ja:'佐賀県',   en:'Saga',       lat:33.25, lng:130.30, tz:9 },
  nagasaki:  { ja:'長崎県',   en:'Nagasaki',   lat:32.74, lng:129.87, tz:9 },
  kumamoto:  { ja:'熊本県',   en:'Kumamoto',   lat:32.79, lng:130.74, tz:9 },
  oita:      { ja:'大分県',   en:'Oita',       lat:33.24, lng:131.61, tz:9 },
  miyazaki:  { ja:'宮崎県',   en:'Miyazaki',   lat:31.91, lng:131.42, tz:9 },
  kagoshima: { ja:'鹿児島県', en:'Kagoshima',  lat:31.56, lng:130.56, tz:9 },
  okinawa:   { ja:'沖縄県',   en:'Okinawa',    lat:26.21, lng:127.68, tz:9 },
};

// ── 高度→ムードのキーフレーム (alt は度) ──
// z=zenith, h=horizon, g=ground, t=sceneTint。日の出/日の入りで朝(rise)/夕(set)を切替。
const _SUN_KF = {
  base: [
    { a:-90, z:[0.02,0.02,0.08], h:[0.06,0.08,0.18], g:[0.04,0.04,0.06], t:[0.20,0.25,0.42] },
    { a:-8 , z:[0.02,0.02,0.08], h:[0.06,0.08,0.18], g:[0.04,0.04,0.06], t:[0.20,0.25,0.42] },
    { a:-4 , z:[0.10,0.10,0.30], h:[0.55,0.42,0.55], g:[0.12,0.12,0.18], t:[0.45,0.42,0.60] },
  ],
  rise: [
    { a:0  , z:[0.30,0.30,0.52], h:[1.00,0.62,0.42], g:[0.22,0.18,0.20], t:[0.85,0.70,0.55] },
    { a:6  , z:[0.45,0.58,0.82], h:[1.00,0.80,0.58], g:[0.42,0.40,0.38], t:[1.00,0.92,0.80] },
  ],
  set: [
    { a:0  , z:[0.30,0.25,0.50], h:[1.00,0.48,0.30], g:[0.24,0.16,0.16], t:[0.92,0.60,0.42] },
    { a:6  , z:[0.40,0.50,0.78], h:[1.00,0.62,0.40], g:[0.40,0.34,0.30], t:[1.00,0.78,0.58] },
  ],
  day: [
    { a:20 , z:[0.40,0.62,0.92], h:[0.92,0.90,0.92], g:[0.52,0.52,0.50], t:[1.00,0.96,0.90] },
    { a:50 , z:[0.36,0.62,0.95], h:[0.85,0.92,1.00], g:[0.55,0.55,0.55], t:[1.00,1.00,1.00] },
  ],
};
function _sunLerp3(a,b,t){ return [ a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t ]; }
function _sunPalette(altDeg, isEvening){
  // キーフレーム列を組み立て (base → rise/set → day)
  const kf = _SUN_KF.base.concat(isEvening ? _SUN_KF.set : _SUN_KF.rise, _SUN_KF.day);
  let lo = kf[0], hi = kf[kf.length-1];
  if(altDeg <= lo.a) hi = lo;
  else if(altDeg >= hi.a) lo = hi;
  else { for(let i=0;i<kf.length-1;i++){ if(altDeg>=kf[i].a && altDeg<=kf[i+1].a){ lo=kf[i]; hi=kf[i+1]; break; } } }
  const span = (hi.a - lo.a) || 1;
  const f = Math.max(0, Math.min(1, (altDeg - lo.a) / span));
  return {
    zenith:  _sunLerp3(lo.z, hi.z, f),
    horizon: _sunLerp3(lo.h, hi.h, f),
    ground:  _sunLerp3(lo.g, hi.g, f),
    tint:    _sunLerp3(lo.t, hi.t, f),
  };
}
// 太陽ディスク色 (低い太陽=濃いオレンジ → 高い太陽=ほぼ白) と グロー強度
function _sunDiscColor(altDeg){
  const kf=[ {a:-2,c:[1.00,0.42,0.18]},{a:6,c:[1.00,0.72,0.42]},{a:20,c:[1.00,0.92,0.78]},{a:45,c:[1.00,0.98,0.92]} ];
  if(altDeg<=kf[0].a) return kf[0].c.slice();
  if(altDeg>=kf[kf.length-1].a) return kf[kf.length-1].c.slice();
  for(let i=0;i<kf.length-1;i++){ if(altDeg>=kf[i].a&&altDeg<=kf[i+1].a){ const f=(altDeg-kf[i].a)/((kf[i+1].a-kf[i].a)||1); return _sunLerp3(kf[i].c,kf[i+1].c,f);} }
  return [1,1,1];
}
function _sunGlowStrength(altDeg){
  if(altDeg<=0) return 1.45;
  if(altDeg>=45) return 0.40;
  if(altDeg<10) return 1.45 + (1.00-1.45)*(altDeg/10);
  return 1.00 + (0.40-1.00)*((altDeg-10)/35);
}

// ── 日照状態 ──
const sun = {
  active: false,                // 操作モード(パネル/3D可視化が有効)。OFFでも空は凍結保持。
  panelOpen: false,
  city: 'tokyo',
  lat: 35.69, lng: 139.69, tz: 9,   // デフォルト=東京（県庁所在地）
  y: null, mo: null, d: null,   // 日付 (未設定なら今日)
  timeMin: 12*60,               // 0..1439
  weather: 'clear',             // 'clear' | 'cloudy' | 'rain' | 'snow' — 疑似HDRIに連動
  // 予報追従(_fcAuto)時のみ、現在時刻の予報から計算した強度を保持し疑似HDRIに反映する。
  // 手動でボタンを選んだときは null（＝従来どおりの固定の曇り/雨の見え方）。
  _fcCloudAmt: null,            // 曇り: 雲量 0..1（cloud_cover% から）
  _fcRainLevel: null,           // 雨: 1=霧雨 / 2=雨 / 3=豪雨（weather_code＋降水量から）
  _fcSnowLevel: null,           // 雪: 1=弱 / 2=雪 / 3=強（weather_code から）
  _fcPrecip: null,              // 降水種別: 'rain' | 'snow' | 'hail'（雹は雷雨96/99）
  _vizKey: '',                  // 太陽軌道の再構築判定 (日付/場所が変わったら作り直す)
};
(function _sunInitDate(){ const n=new Date(); sun.y=n.getFullYear(); sun.mo=n.getMonth()+1; sun.d=n.getDate(); sun.timeMin=Math.min(1430, Math.round((n.getHours()*60+n.getMinutes())/10)*10); })();

// 選択中の現地壁時計時刻 → 絶対 Date(UTC基準) を構築
function _sunDate(){
  const hh=Math.floor(sun.timeMin/60), mm=sun.timeMin%60;
  return new Date(Date.UTC(sun.y, sun.mo-1, sun.d, hh, mm) - sun.tz*3600000);
}
// 絶対Date → 現地壁時計の "HH:MM"
function _sunFmtHM(dt){
  if(!dt || isNaN(dt.getTime())) return '—';
  const loc = new Date(dt.getTime() + sun.tz*3600000);
  const h=loc.getUTCHours(), m=loc.getUTCMinutes();
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
}

// 日照モードの ON/OFF。
// ON  : 空を日照シミュレーションにし、3D可視化(コンパス/軌道)を表示。
// OFF : 操作モードを抜けるだけ。空(__sun)は「凍結表示」として継続し、3D可視化のみ隠す。
//       手動で環境プリセットを選ぶ(setEnvPreset)までこの表示は維持される。
function _setSunActive(on){
  if(on === sun.active){ if(on) updateSunMode(); return; }
  sun.active = on;
  // cbar のボタン表示制御用（CSS: body.sun-active で カメラ/日照 以外を隠す）。
  document.body.classList.toggle('sun-active', on);
  const btn = document.getElementById('btn-sun');
  if(on){
    env.preset = '__sun';
    const mesh = _envBuildMesh();
    mesh.visible = true; mesh.position.copy(camPos);
    if(env.material) env.material.uniforms.uYaw.value = 0;   // 方位は uSunDir に内包
    document.querySelectorAll('#env-panel .env-btn').forEach(b=>b.classList.remove('on'));
    _sunVizBuild(); _sunVizSetVisible(true);
    updateSunMode();
    if(btn) btn.classList.add('on');
    _sunLockEnvPanel(true);
  } else {
    // 空は凍結保持（uShowSun も env.preset='__sun' もそのまま）。3D可視化だけ隠す。
    _sunVizSetVisible(false);
    if(btn) btn.classList.remove('on');
    _sunLockEnvPanel(false);
    markDirty(6);
  }
}

// 環境パネルに「日照モード中」の案内を表示（プリセット押下で手動復帰）
function _sunLockEnvPanel(locked){
  const note = document.getElementById('env-sun-lock');
  if(note) note.style.display = locked ? 'block' : 'none';
}

// 指定時刻の太陽ワールド方向。北はシーン固定軸(−Z)。コンパス方位 az+π。
function _sunWorldDir(date){
  const pos = SunCalc.getPosition(date, sun.lat, sun.lng);
  const worldAz = pos.azimuth + Math.PI;
  const ca = Math.cos(pos.altitude);
  return { dir:new THREE.Vector3(Math.sin(worldAz)*ca, Math.sin(pos.altitude), -Math.cos(worldAz)*ca),
           alt:pos.altitude, az:pos.azimuth };
}

// 天気(疑似HDRI)変換: 晴天パレットを曇り/雨向けに変換。
// 日照の高度駆動(昼夜の明暗)は pal に既に乗っているので維持される。
function _applyWeather(pal, weather){
  if(weather === 'clear') return pal;
  const desat=(c,amt)=>{ const l=0.30*c[0]+0.59*c[1]+0.11*c[2];
    return [c[0]+(l-c[0])*amt, c[1]+(l-c[1])*amt, c[2]+(l-c[2])*amt]; };
  const mul=(c,m)=>[c[0]*m[0], c[1]*m[1], c[2]*m[2]];
  // 予報追従(_fcAuto)時のみ、雲量/雨レベルの強度を反映する。手動選択時は従来の固定。
  const auto = !!sun._fcAuto;
  if(weather === 'cloudy'){
    if(auto && typeof sun._fcCloudAmt === 'number'){
      // 予報の雲量(0..1)で曇りの厚さをスケール → 疑似HDRIに雲量を再現。
      // 雲量小=薄曇り(ほぼ晴れ)、雲量大=厚い灰色の本曇り。
      const amt = Math.max(0, Math.min(1, sun._fcCloudAmt));
      const desA = 0.30 + 0.62*amt;
      const z=desat(pal.zenith,desA), h=desat(pal.horizon,desA), g=desat(pal.ground,desA*0.92), t=desat(pal.tint,desA*0.92);
      const dv = 1.00 - 0.22*amt;
      const dim=[dv, dv+0.01, dv+0.04];
      const tv = 0.99 - 0.13*amt;
      return { zenith:mul(z,dim), horizon:mul(h,dim), ground:mul(g,dim), tint:mul(t,[tv, tv+0.02, tv+0.05]) };
    }
    // 手動（または雲量不明）: 従来どおりの固定の曇り（灰色フラット・わずかに寒色）
    const z=desat(pal.zenith,0.85), h=desat(pal.horizon,0.85), g=desat(pal.ground,0.80), t=desat(pal.tint,0.80);
    const dim=[0.84,0.85,0.88];
    return { zenith:mul(z,dim), horizon:mul(h,dim), ground:mul(g,dim), tint:mul(t,[0.90,0.92,0.95]) };
  }
  if(weather === 'snow'){
    // 雪空: 明るい灰白色（曇りより脱色＆やや明るめ。雨のように暗くしない）。
    const z=desat(pal.zenith,0.90), h=desat(pal.horizon,0.90), g=desat(pal.ground,0.86), t=desat(pal.tint,0.86);
    const dim=[0.86,0.88,0.92];
    return { zenith:mul(z,dim), horizon:mul(h,dim), ground:mul(g,dim), tint:mul(t,[0.90,0.92,0.96]) };
  }
  // rain
  if(auto && (sun._fcRainLevel===1 || sun._fcRainLevel===3)){
    // 予報の雨レベル: 1=霧雨（明るめ薄い青灰） / 3=豪雨（かなり暗い青灰）。
    // 2=雨 は下の従来固定と同じ見え方なので分岐不要。
    const RA = (sun._fcRainLevel===1)
      ? { des:0.82, desG:0.80, dim:[0.72,0.76,0.84], tint:[0.80,0.84,0.92] }   // 霧雨
      : { des:0.96, desG:0.92, dim:[0.40,0.45,0.56], tint:[0.48,0.55,0.68] };  // 豪雨
    const z=desat(pal.zenith,RA.des), h=desat(pal.horizon,RA.des), g=desat(pal.ground,RA.desG), t=desat(pal.tint,RA.desG);
    return { zenith:mul(z,RA.dim), horizon:mul(h,RA.dim), ground:mul(g,RA.dim), tint:mul(t,RA.tint) };
  }
  // 手動（または rainLevel===2 / 不明）: 従来どおりの固定の雨（暗く青灰色）
  const z=desat(pal.zenith,0.92), h=desat(pal.horizon,0.92), g=desat(pal.ground,0.88), t=desat(pal.tint,0.88);
  const dim=[0.55,0.60,0.70];
  return { zenith:mul(z,dim), horizon:mul(h,dim), ground:mul(g,dim), tint:mul(t,[0.62,0.68,0.78]) };
}

// 雲量(amt 0..1)と雲の明るさ(light)を決める。
//  ★プロシージャル雲は「実際の天気予報を取得」したフォローモード(_fcAuto)時のみ描く。
//   手動の晴れ/曇り/雨は従来通りフラット（雲なし）＝見た目を一切変えない。
//  予報時は cloud_cover% / 雨レベルで連続的にスケール（強度再現）。
function _sunCloudParams(){
  if(!sun._fcAuto) return { amt:0.0, light:1.0 };    // 手動＝雲なし（フラット表示を厳守）
  // ★雲量は天気分類(晴れ/曇り/雨)に関係なく cloud_cover% がそのまま被覆率を決める。
  //   50%なら晴れ判定でもちゃんと半分雲が出る。雲は天気に依らず常に存在する。
  const a = (typeof sun._fcCloudAmt === 'number') ? sun._fcCloudAmt : 0.0;  // 実雲量 0..1
  // 天気は「雲の明暗(ムード)」だけを決める。被覆率(amt)には触らない。
  let light = 0.95 - 0.33 * a;                        // 雲が多いほど下面がやや暗い
  if(sun.weather === 'rain'){
    const lv = sun._fcRainLevel || 2;
    light = (lv >= 3) ? 0.30 : (lv >= 2 ? 0.45 : 0.60);  // 雨ほど暗い雲
  } else if(sun.weather === 'snow'){
    light = 0.88;                                    // 雪空は明るい灰白色の雲
  }
  return { amt:a, light };
}

// 雲のドリフト(流れ)アニメ。日照モード中＆雲があるときだけ ~10fps で回し、
// それ以外は自動停止（重い連続描画を避ける）。rAFはラップ済みなので setTimeout を使う。
let _cloudAnimTimer = null, _cloudT0 = null;
function _cloudAnimTick(){
  _cloudAnimTimer = null;
  // 日照の空(__sun)が表示中＆雲があれば回す。モードを抜けても凍結保持の空が出ていれば流れ続ける。
  if(!(env.material && _sunSkyShown() && env.material.uniforms.uCloudAmt.value > 0.001)) return;
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if(_cloudT0 == null) _cloudT0 = now;
  env.material.uniforms.uCloudTime.value = (now - _cloudT0) / 1000;
  markDirty(6);
  _cloudAnimTimer = setTimeout(_cloudAnimTick, 100);
}
function _cloudAnimEnsure(){
  if(_cloudAnimTimer == null && env.material && _sunSkyShown() && env.material.uniforms.uCloudAmt.value > 0.001) _cloudAnimTick();
}
// 検証/微調整用フック（手動で雲量・明るさを直接設定して見た目を確認できる）
window.__setClouds = function(amt, light){
  if(!env.material) return;
  env.material.uniforms.uCloudAmt.value = (amt == null ? 0.6 : amt);
  if(light != null) env.material.uniforms.uCloudLight.value = light;
  _cloudAnimEnsure(); markDirty(6);
};
window.__cloudDbg = function(){
  if(!env.material) return { err:'no env.material' };
  const u = env.material.uniforms;
  return { amt:+u.uCloudAmt.value.toFixed(3), light:+u.uCloudLight.value.toFixed(3),
    time:+u.uCloudTime.value.toFixed(2), sunActive: !!(sun&&sun.active), fcAuto: !!(sun&&sun._fcAuto),
    weather: sun&&sun.weather, fcCloudAmt: sun&&sun._fcCloudAmt, fcRainLevel: sun&&sun._fcRainLevel,
    timer: _cloudAnimTimer!=null, params: (typeof _sunCloudParams==='function'? _sunCloudParams():null) };
};

// ── 降水の表現（雨/雪/雹）: シーンの上に2Dキャンバスで描く前面オーバーレイ ──
// 3Dパイプラインから独立。雨=斜めの筋(霧雨/雨/豪雨)、雪=白い粒がゆらぎ落ちる、雹=速く白い短粒。
// ★日照の空(__sun)が表示中なら、日照ボタンでモードを抜けても(凍結保持)降り続ける＝雲と同じ挙動。
let _precipCv=null, _precipCtx=null, _precipParts=[], _precipTimer=null, _precipType='none', _precipLevel=0, _precipLast=null;
let _precipLastYaw=null, _precipLastPitch=null; const _precipDirV=new THREE.Vector3();
// カメラの回転に合わせて粒を逆方向へずらす（パララックス）→ 画面に張り付かず世界に追従して見える。
function _precipParallax(W,H){
  if(typeof camera==='undefined' || !camera) return {sx:0, sy:0};
  camera.getWorldDirection(_precipDirV);
  const yaw=Math.atan2(_precipDirV.x, _precipDirV.z);
  const pitch=Math.asin(Math.max(-1,Math.min(1,_precipDirV.y)));
  if(_precipLastYaw==null){ _precipLastYaw=yaw; _precipLastPitch=pitch; return {sx:0, sy:0}; }
  let dyaw=yaw-_precipLastYaw; if(dyaw>Math.PI)dyaw-=6.2832; if(dyaw<-Math.PI)dyaw+=6.2832;
  const dpitch=pitch-_precipLastPitch;
  _precipLastYaw=yaw; _precipLastPitch=pitch;
  const vfov=((camera.fov||50)*Math.PI/180), hfov=2*Math.atan(Math.tan(vfov/2)*(W/Math.max(1,H)));
  // カメラが右を向く(dyaw>0)→粒は左へ。カメラが上を向く(dpitch>0)→粒は下へ。
  return { sx:-dyaw*(W/Math.max(0.001,hfov)), sy:dpitch*(H/Math.max(0.001,vfov)) };
}
function _sunSkyShown(){ return (typeof env!=='undefined' && env && env.mesh && env.mesh.visible && env.preset==='__sun'); }
function _precipConfig(type, lv){
  if(type==='snow'){
    if(lv>=3) return { snow:true, n:540, vmin:60, vmax:130, smin:1.4, smax:3.6, sway:1.6, alpha:0.9 };
    if(lv>=2) return { snow:true, n:320, vmin:45, vmax:100, smin:1.2, smax:3.0, sway:1.3, alpha:0.85 };
    return       { snow:true, n:160, vmin:35, vmax:75,  smin:1.0, smax:2.4, sway:1.0, alpha:0.78 };
  }
  if(type==='hail'){   // 雹: 速く白っぽい短粒（先端に丸）
    if(lv>=3) return { head:2.1, n:430, vmin:1150, vmax:1550, lmin:6, lmax:12, slant:0.12, w:2.2, alpha:0.72 };
    return       { head:1.8, n:300, vmin:1050, vmax:1400, lmin:5, lmax:10, slant:0.12, w:1.9, alpha:0.64 };
  }
  // rain
  if(lv>=3) return { n:380, vmin:1020, vmax:1420, lmin:22, lmax:42, slant:0.30, w:1.7, alpha:0.42 };  // 豪雨
  if(lv>=2) return { n:200, vmin:740,  vmax:1060, lmin:15, lmax:30, slant:0.24, w:1.3, alpha:0.36 };  // 雨
  return       { n:340, vmin:380,  vmax:560,  lmin:7,  lmax:14, slant:0.14, w:1.0, alpha:0.40 };  // 霧雨(細かい粒を多く＝見えるように)
}
function _precipEnsure(){
  if(_precipCv) return;
  _precipCv=document.createElement('canvas'); _precipCv.id='rain-fx';
  _precipCv.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;display:none;';
  document.body.appendChild(_precipCv);
  _precipCtx=_precipCv.getContext('2d');
}
function _precipResize(){
  if(!_precipCv) return;
  const dpr=Math.min(2, window.devicePixelRatio||1);
  _precipCv.width=Math.round(window.innerWidth*dpr); _precipCv.height=Math.round(window.innerHeight*dpr);
  _precipCtx.setTransform(dpr,0,0,dpr,0,0);
}
function _precipSeed(cfg){
  const W=window.innerWidth, H=window.innerHeight; _precipParts=[];
  for(let i=0;i<cfg.n;i++){
    const p={ x:Math.random()*(W+240)-120, y:Math.random()*H, v:cfg.vmin+Math.random()*(cfg.vmax-cfg.vmin), ph:Math.random()*6.283 };
    if(cfg.snow) p.r=cfg.smin+Math.random()*(cfg.smax-cfg.smin); else p.l=cfg.lmin+Math.random()*(cfg.lmax-cfg.lmin);
    _precipParts.push(p);
  }
}
function _precipTick(){
  _precipTimer=null;
  if(_precipLevel<1 || _precipType==='none' || !_sunSkyShown()){ if(_precipCv) _precipCv.style.display='none'; _precipLast=null; _precipLastYaw=null; return; }
  const cfg=_precipConfig(_precipType,_precipLevel);
  const now=(typeof performance!=='undefined'?performance.now():Date.now());
  const dt=_precipLast==null?0.016:Math.min(0.05,(now-_precipLast)/1000); _precipLast=now;
  const t=now/1000, W=window.innerWidth, H=window.innerHeight, ctx=_precipCtx;
  const par=_precipParallax(W,H), sx=par.sx, sy=par.sy, WW=W+260;
  ctx.clearRect(0,0,W,H);
  if(cfg.snow){
    ctx.fillStyle='rgba(248,250,255,'+cfg.alpha+')';
    for(const p of _precipParts){
      p.y+=p.v*dt+sy; p.x+=Math.sin(t*cfg.sway+p.ph)*0.5+sx;
      if(p.x<-130)p.x+=WW; else if(p.x>W+130)p.x-=WW;
      if(p.y>H+8){ p.y=-8-Math.random()*40; p.x=Math.random()*(W+240)-120; }
      else if(p.y<-60){ p.y=H+Math.random()*30; p.x=Math.random()*(W+240)-120; }
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,6.2832); ctx.fill();
    }
  } else {
    ctx.strokeStyle=(_precipType==='hail'?'rgba(232,240,250,':'rgba(176,194,216,')+cfg.alpha+')';
    ctx.lineWidth=cfg.w; ctx.lineCap='round'; ctx.beginPath();
    for(const p of _precipParts){
      p.y+=p.v*dt+sy; p.x+=p.v*dt*cfg.slant+sx;
      if(p.x<-130)p.x+=WW; else if(p.x>W+130)p.x-=WW;
      if(p.y>H+24){ p.y=-24-Math.random()*80; p.x=Math.random()*(W+240)-120; }
      else if(p.y<-90){ p.y=H+Math.random()*40; p.x=Math.random()*(W+240)-120; }
      ctx.moveTo(p.x,p.y); ctx.lineTo(p.x - p.l*cfg.slant, p.y - p.l);
    }
    ctx.stroke();
    if(cfg.head){ ctx.fillStyle='rgba(240,246,255,'+Math.min(1,cfg.alpha+0.2)+')';
      for(const p of _precipParts){ ctx.beginPath(); ctx.arc(p.x,p.y,cfg.head,0,6.2832); ctx.fill(); } }
  }
  _precipTimer=setTimeout(_precipTick, 33);   // ~30fps（rAFはラップ済なので setTimeout）
}
function _precipFxUpdate(type, lv){
  _precipEnsure();
  type=type||'none'; const nl=(type==='none')?0:(lv||0);
  if(nl>=1){
    const reseed=(_precipType!==type)||(_precipLevel<1)||(_precipConfig(_precipType,_precipLevel).n!==_precipConfig(type,nl).n);
    _precipType=type; _precipLevel=nl; _precipResize();
    if(reseed) _precipSeed(_precipConfig(type,nl));
    _precipCv.style.display='block';
    if(_precipTimer==null){ _precipLast=null; _precipTick(); }
  } else { _precipLevel=0; _precipType='none'; if(_precipCv) _precipCv.style.display='none'; }
}
window.addEventListener('resize', ()=>{ if(_precipLevel>=1) _precipResize(); });
// iOS/iPad: テキスト入力にフォーカスすると position:fixed のページごとスクロールしてしまう。
// アプリは全画面固定で正規のページスクロールが無いので、常に左上(0,0)へ戻す（内部パネルの
// overflow スクロールはwindowのscrollイベントを発火しないので影響なし）。
function _lockPageScroll(){ if(window.pageYOffset||window.pageXOffset||document.documentElement.scrollTop||document.body.scrollTop){ window.scrollTo(0,0); document.documentElement.scrollTop=0; document.body.scrollTop=0; } }
window.addEventListener('scroll', _lockPageScroll, {passive:true});
document.addEventListener('focusin', ()=>setTimeout(_lockPageScroll,60));
document.addEventListener('focusout', ()=>setTimeout(_lockPageScroll,60));
if(window.visualViewport){ window.visualViewport.addEventListener('scroll', _lockPageScroll); }
// iPad/iOS: ページ地のタッチドラッグでページごと動くのを抑止（overflowスクロール可能なパネル内は許可）。
document.addEventListener('touchmove', function(e){
  let el = e.target;
  // ボタン/入力/スライダー等のタップは触らない（preventDefaultでクリックが消えてダブルタップ化するのを防ぐ）。
  if(el.closest && el.closest('button, input, select, textarea, a, [role=button], .lr, #joy, #joy-vert')) return;
  while(el && el.nodeType===1 && el!==document.body){
    if(el.scrollHeight > el.clientHeight + 1){ const oy=getComputedStyle(el).overflowY; if(oy==='auto'||oy==='scroll') return; }
    el = el.parentElement;
  }
  if(e.cancelable) e.preventDefault();   // ページ地(背景)のスクロールだけを止める
}, {passive:false});
window.__setRain   = function(lv){ _precipFxUpdate(lv>=1?'rain':'none', lv||0); };  // 後方互換
window.__setPrecip = function(type, lv){ _precipFxUpdate(type, lv||0); };           // 検証/微調整用

// 現在の sun.state から太陽位置/日照時間を計算し、ドーム・ティント・読み出し・3D可視化を更新
function updateSunMode(){
  if(!sun.active) return;
  const date = _sunDate();
  const w = _sunWorldDir(date);
  const altDeg = w.alt * 180/Math.PI;
  const dir = w.dir;

  // 朝/夕の判定（南中前後）でパレットを切替
  let times = null;
  try { times = SunCalc.getTimes(date, sun.lat, sun.lng); } catch(_){}
  const isEvening = times && !isNaN(times.solarNoon.getTime()) ? (date.getTime() > times.solarNoon.getTime()) : (sun.timeMin >= 12*60);

  // 予報を取得済み＆自動モードなら、現在の日付/時刻に対応する天気を sun.weather に
  // 反映してからパレットを組む → 日時を動かすだけで光が実天気に追従する。
  if(typeof _sunFcApplyAuto==='function') _sunFcApplyAuto();

  // 晴天パレット → 天気変換 → __sun プリセット書き換え → ドーム uniform + sceneTint
  const pal = _applyWeather(_sunPalette(altDeg, isEvening), sun.weather);
  const clear = (sun.weather === 'clear');
  const P = ENV_PRESETS.__sun;
  P.zenith=pal.zenith; P.horizon=pal.horizon; P.ground=pal.ground; P.sceneTint=pal.tint; P.int=1.0;
  if(env.material){
    const u=env.material.uniforms;
    u.uZenith.value.setRGB(...pal.zenith);
    u.uHorizon.value.setRGB(...pal.horizon);
    u.uGround.value.setRGB(...pal.ground);
    u.uIntensity.value = env.intensity;
    // 太陽ディスク/グローは「晴れ」かつ地平線上のときだけ。曇り/雨は雲に隠れる想定で無効。
    u.uShowSun.value = (clear && altDeg > -0.5) ? 1.0 : 0.0;
    u.uSunDir.value.copy(dir);
    u.uSunColor.value.setRGB(..._sunDiscColor(altDeg));
    u.uSunGlow.value = _sunGlowStrength(altDeg);
    // 雲量/雲の明るさ（天気＋予報強度から）。夜は描いても見えないので高度で減衰。
    const cp = _sunCloudParams();
    const nightFade = THREE.MathUtils.clamp((altDeg + 6.0) / 8.0, 0.0, 1.0); // 薄明で雲をフェードアウト
    u.uCloudAmt.value = cp.amt;
    u.uCloudLight.value = cp.light * (0.25 + 0.75 * nightFade);
  }
  _cloudAnimEnsure();
  // 降水の表現: 手動でも予報でも、雨/雪を選べば降る。雹は予報(雷雨96/99)時のみ。夜(高度<-6)は止める。
  let _pType='none', _pLv=0;
  if(altDeg > -6){
    if(sun._fcAuto && sun._fcPrecip==='hail'){ _pType='hail'; _pLv=3; }
    else if(sun.weather==='snow'){ _pType='snow'; _pLv = sun._fcAuto ? (sun._fcSnowLevel||2) : 2; }
    else if(sun.weather==='rain'){ _pType='rain'; _pLv = sun._fcAuto ? (sun._fcRainLevel||2) : 2; }
  }
  _precipFxUpdate(_pType, _pLv);
  applySceneTint();
  _sunUpdateReadout(altDeg, w.az, times);
  _sunVizUpdate(dir, times);   // 3D コンパス＋太陽軌道を更新
  // 取得済みの予報を、現在の日付/場所/時刻に合わせて参照表示（範囲外は自動的に隠れる）。
  // 天気の自動適用は上の _sunFcApplyAuto() で済んでいる。
  if(typeof _sunFcReadout==='function') _sunFcReadout();
  markDirty(6);
}

// 読み出しUI（日の出/南中/日の入り/昼の長さ/高度・方位）
function _sunUpdateReadout(altDeg, azRad, times){
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  // コンパス方位（北=0、東回り、度）
  let compass = ((azRad*180/Math.PI) + 180) % 360; if(compass<0) compass+=360;
  set('sun-r-alt', altDeg.toFixed(1)+'°');
  set('sun-r-az',  compass.toFixed(0)+'°');
  if(times && !isNaN(times.sunrise.getTime()) && !isNaN(times.sunset.getTime())){
    set('sun-r-rise', _sunFmtHM(times.sunrise));
    set('sun-r-noon', _sunFmtHM(times.solarNoon));
    set('sun-r-set',  _sunFmtHM(times.sunset));
    const lenMs = times.sunset.getTime() - times.sunrise.getTime();
    if(lenMs>0){ const h=Math.floor(lenMs/3600000), m=Math.round((lenMs%3600000)/60000); set('sun-r-len', h+'h'+String(m).padStart(2,'0')+'m'); }
    else set('sun-r-len','—');
  } else {
    // 白夜/極夜: 高度が正なら終日昼、負なら終日夜
    const polar = (window._lang==='en') ? (altDeg>0?'Polar day':'Polar night') : (altDeg>0?'終日昼（白夜）':'終日夜（極夜）');
    set('sun-r-rise','—'); set('sun-r-noon', times?_sunFmtHM(times.solarNoon):'—'); set('sun-r-set','—'); set('sun-r-len', polar);
  }
  // 時刻ラベル
  const hh=Math.floor(sun.timeMin/60), mm=sun.timeMin%60;
  set('sun-time-val', String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0'));
  // 日の出/日の入りスライダーマーカー
  _sunUpdateScrubMarks(times);
}
function _sunUpdateScrubMarks(times){
  const wrap=document.getElementById('sun-scrub-marks'); if(!wrap) return;
  const place=(id,dt)=>{ const el=document.getElementById(id); if(!el) return;
    if(!dt||isNaN(dt.getTime())){ el.style.display='none'; return; }
    const loc=new Date(dt.getTime()+sun.tz*3600000); const min=loc.getUTCHours()*60+loc.getUTCMinutes();
    el.style.display='block'; el.style.left=(min/1430*100)+'%';
  };
  place('sun-mark-rise', times&&times.sunrise);
  place('sun-mark-set',  times&&times.sunset);
}

// ── DOM ハンドラ ──
// 日照パネルの位置: 常に左サイドバー(シーンレイヤー)の右隣に寄せて配置
// （リサイズ/折りたたみに追従）。カメラパネルは右サイドバーなので左側に置く。
function _sunUpdatePanelPos(){
  const pan = document.getElementById('sun-panel'); if(!pan) return;
  // 左サイドバーの右端 + 余白。サイドバーが無い/隠れているときは左端14px。
  let leftPx = 14;
  const lp = document.getElementById('layer-panel');
  if(lp && getComputedStyle(lp).display !== 'none'){
    const r = lp.getBoundingClientRect();
    if(r.width > 4) leftPx = Math.round(r.right + 12);
  }
  pan.style.left = leftPx + 'px'; pan.style.right = 'auto'; pan.style.transform = 'none';
}
function _sunShowPanel(show){
  sun.panelOpen = show;
  const pan = document.getElementById('sun-panel');
  if(pan) pan.style.display = show ? 'block' : 'none';
  if(show){ _sunUpdatePanelPos(); _sunSyncForm(); }
}
window.toggleSunMode = function(){
  // 日照は独立トグル（カメラ等とは同時操作OK）。
  if(!sun.active){
    // 日照と測定は排他（user request 2026-06-19）。パネルが画面上でぶつかるため、
    // 日照を開くなら測定を閉じる。
    if(typeof msr!=='undefined' && msr.active && typeof _closeMeasureOnly==='function') _closeMeasureOnly();
    _setSunActive(true);   // 点灯
    _sunShowPanel(true);   // 操作パネルを開く
  } else {
    _sunShowPanel(false);  // 消灯
    _setSunActive(false);
  }
};
// ── フォーム/ハンドラ ──
function _sunCoordsText(){
  const c=SUN_CITIES[sun.city]; if(!c) return '—';
  const en=window._lang==='en';
  return en ? `Lat ${c.lat.toFixed(2)}° / Lng ${c.lng.toFixed(2)}°`
            : `緯度 ${c.lat.toFixed(2)}° / 経度 ${c.lng.toFixed(2)}°`;
}
function _sunUpdateCoords(){ const el=document.getElementById('sun-coords'); if(el) el.textContent=_sunCoordsText(); }

window.onSunCityChange = function(key){
  const c=SUN_CITIES[key]; if(!c) return;
  sun.city=key; sun.lat=c.lat; sun.lng=c.lng; sun.tz=c.tz;
  _sunUpdateCoords();
  updateSunMode();
};
window.onSunDate = function(val){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(val||''); if(!m) return;
  sun.y=+m[1]; sun.mo=+m[2]; sun.d=+m[3]; _sunSyncForm(); updateSunMode();
};
window.onSunTime = function(val){ sun.timeMin=Math.max(0,Math.min(1439,+val)); updateSunMode(); };
window.onSunWeather = function(wx){
  if(wx!=='clear' && wx!=='cloudy' && wx!=='rain' && wx!=='snow') return;
  sun.weather = wx;
  sun._fcAuto = false;   // 手動で天気を選んだら予報の自動追従を解除（再取得で再開）
  sun._fcCloudAmt = null; sun._fcRainLevel = null; sun._fcSnowLevel = null; sun._fcPrecip = null;  // 手動は従来の固定の見え方に戻す
  document.querySelectorAll('#sun-panel .sun-wx-btn').forEach(b=>b.classList.toggle('on', b.dataset.wx===wx));
  updateSunMode();
};
window.sunSetNow = function(){
  const n=new Date(); sun.y=n.getFullYear(); sun.mo=n.getMonth()+1; sun.d=n.getDate();
  sun.timeMin=Math.min(1430, Math.round((n.getHours()*60+n.getMinutes())/10)*10);
  _sunSyncForm(); updateSunMode();
};

