import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const required=['address','access','price','usageRules'];
const labels={address:'所在地',access:'アクセス',price:'料金',usageRules:'利用条件',area:'面積',ceilingHeight:'天井高',parking:'駐車場',photoRights:'写真の掲載許諾',onlineSceneId:'オンラインのシーン対応'};
const reasons={identity_unconfirmed:'施設・フロアの最終同定',source_not_complete:'ローカルデータの編集完了',recipient_missing:'確認依頼の宛先',sharing_unapproved:'社外共有の承認',preview_missing:'先方確認リンクの発行',preview_expiry_unverified:'確認リンクの有効期限','review:north':'方角の確認','review:paths':'区画パスの確認','review:visual':'最終表示の目視確認','review:photoPermission':'写真の掲載許諾の確認'};
const blockerLabel=value=>reasons[value]||({'missing':'情報不足','unknown':'未確認','conflict':'出典の矛盾','scope':'対象フロアの不一致','stale':'出典の再確認が必要','unsourced':'根拠不足'}[value.split(':')[0]]||value.split(':')[0])+': '+(labels[value.split(':')[1]]||value.split(':')[1]);
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=8192;
function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value).toISOString().slice(0,10)!==value)throw Error('Invalid checked date');return Date.parse(value);}
function source(value){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.hash||[...url.searchParams.keys()].some(k=>/token|secret|signature|credential|api.?key/i.test(k)))throw Error('Invalid public source URL');
 return url.href;
}
const md=value=>String(value).replace(/[\\`*_{}\[\]()<>#|!]/g,'\\$&').replace(/[\r\n]+/g,' ');

// Evidence ledger validation is not independent source verification or permission to send.
export function buildListingReviewPack(input,{asOf,maxAgeDays=30}={}){
 const now=date(asOf),record=structuredClone(input),blockers=[];
 if(record.version!==1||!text(record.studioName)||!text(record.propertyId)||!text(record.sceneId)||!Number.isSafeInteger(record.revision)||record.revision<0||!/^[a-f0-9]{64}$/.test(record.projectSha256)||!Array.isArray(record.facts)||record.facts.length>200||!record.checks||!Number.isInteger(maxAgeDays)||maxAgeDays<1||maxAgeDays>365)throw Error('Invalid review binding');
 if(record.identityConfirmed!==true)blockers.push('identity_unconfirmed');
 if(record.sourceStatus!=='editing_complete')blockers.push('source_not_complete');
 for(const field of ['north','paths','visual','photoPermission'])if(record.checks[field]!==true)blockers.push('review:'+field);
 const groups=new Map();
 for(const fact of record.facts){
  if(!text(fact.field)||!['sourced','unknown','not_applicable','conflict'].includes(fact.status)||!text(fact.scope))throw Error('Invalid fact');
  if(fact.sourceUrl!=null)source(fact.sourceUrl);
  if(fact.checkedAt!=null)date(fact.checkedAt);
  if(fact.value!==null&&!(typeof fact.value==='string'&&fact.value.length<=8192||typeof fact.value==='boolean'||typeof fact.value==='number'&&Number.isFinite(fact.value)))throw Error('Invalid fact value');
  const values=groups.get(fact.field)||[];values.push(fact);groups.set(fact.field,values);
 }
 const acceptedFacts=[];
 for(const [field,facts] of groups){
  if(facts.length!==1){blockers.push('conflict:'+field);continue;}
  const fact=facts[0];
  if(!['facility',record.sceneId].includes(fact.scope)){blockers.push('scope:'+field);continue;}
  if(!['sourced','not_applicable'].includes(fact.status)){blockers.push(fact.status+':'+field);continue;}
  if(!fact.sourceUrl||!fact.checkedAt||fact.value===null||typeof fact.value==='string'&&!text(fact.value)){blockers.push('unsourced:'+field);continue;}
  const age=(now-date(fact.checkedAt))/86400000;
  if(age<0||age>maxAgeDays){blockers.push('stale:'+field);continue;}
  acceptedFacts.push(fact);
 }
 for(const field of required)if(!acceptedFacts.some(f=>f.field===field))blockers.push('missing:'+field);
 if(!text(record.recipient))blockers.push('recipient_missing');
 if(record.approvedToShare!==true)blockers.push('sharing_unapproved');
 if(record.previewUrl){
  const url=new URL(record.previewUrl);
  if(url.origin!=='https://locahun3d.com'||!/^\/preview\/[A-Za-z0-9_-]+$/.test(url.pathname)||url.search||url.hash||url.username||url.password)throw Error('Invalid client preview URL');
  if(!record.previewExpiresAt||date(record.previewExpiresAt)<=now)blockers.push('preview_expiry_unverified');
 }else blockers.push('preview_missing');
 const readyToShare=blockers.length===0;
 const lines=['# '+md(record.studioName)+' 掲載確認資料','',
  '状態: '+(readyToShare?'確認依頼用（送信前の最終確認が必要）':'社内確認用・未完了'),
  '施設: '+md(record.propertyId)+' / シーン: '+md(record.sceneId),
  '対象版: '+record.revision+' / 確認日: '+asOf,
  '入力識別子: '+record.projectSha256,'',
  '## 出典付き情報','',
  ...acceptedFacts.map(f=>'- '+md(labels[f.field]||f.field)+': '+md(f.value)+(f.unit?' '+md(f.unit):'')+'（対象: '+md(f.scope==='facility'?'施設全体':f.scope)+'、確認日: '+f.checkedAt+'）\n  出典: <'+source(f.sourceUrl)+'>'),
  '', '## 未確認・要確認','',...blockers.map(v=>'- '+md(blockerLabel(v))), '',
  'この資料は入力された出典と確認記録を整理したものです。自動で送信・公開・共有リンク発行はしません。写真の許諾、方角、区画、実表示の確認は別途必要です。',
 ];
 if(readyToShare)lines.push('','## 確認依頼文','',md(record.recipient)+' 様','',md(record.studioName)+'の掲載内容について、ご確認をお願いいたします。','対象: '+md(record.sceneId)+'、版: '+record.revision,'確認用リンク: <'+record.previewUrl+'>','確認期限: '+record.previewExpiresAt,'記載内容や掲載範囲に修正がありましたら、お知らせください。');
 return {version:1,asOf,readyToShare,sent:false,published:false,verification:'declared_evidence_only',blockers,acceptedFacts,markdown:lines.join('\n')+'\n'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [input,out,asOf]=process.argv.slice(2);if(!input||!out||!asOf)throw Error('Usage: listing-review-pack.mjs LEDGER_JSON NEW_REPORT_MD YYYY-MM-DD');
 const stat=await fs.stat(input);if(stat.size>2*1024**2)throw Error('Ledger too large');
 const result=buildListingReviewPack(JSON.parse(await fs.readFile(input,'utf8')),{asOf});
 await fs.writeFile(out,result.markdown,{flag:'wx'});
 console.log(JSON.stringify({readyToShare:result.readyToShare,blockers:result.blockers,output:path.resolve(out)}));
}
