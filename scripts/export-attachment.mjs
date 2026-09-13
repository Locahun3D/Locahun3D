// Inject authenticated admin operations; this module never creates assets or publishes listings.
export async function attachVerifiedExport(binding,io){
 const b=structuredClone(binding),hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 for(const name of ['propertyId','sceneId','assetId','expectedUpdatedAt'])if(typeof b[name]!=='string'||!b[name].trim())throw Error('Missing target binding: '+name);
 if(typeof b.previousUrl!=='string'||!Number.isSafeInteger(b.revision)||b.revision<0||!hex(b.projectSha256)||!hex(b.archiveSha256)||!Number.isSafeInteger(b.archiveBytes)||b.archiveBytes<1||b.archiveBytes>2*1024**3)throw Error('Invalid export binding');
 const source=async()=>{
  const current=await io.verifySource();
  if(current.status!=='editing_complete'||current.revision!==b.revision||current.projectSha256!==b.projectSha256)throw Error('Completed source revision changed');
 };
 const scene=p=>{
  if(p?.id!==b.propertyId||p.status!=='draft'||!Array.isArray(p.splatItems))throw Error('Target property is not the bound draft');
  const found=p.splatItems.filter(s=>s.id===b.sceneId);if(found.length!==1)throw Error('Missing or ambiguous target scene');return found[0];
 };
 await source();
 const asset=await io.getAsset(b.assetId);
 if(asset?.id!==b.assetId||asset.status!=='ready'||!['splat','zip'].includes(asset.kind)||asset.size!==b.archiveBytes||typeof asset.url!=='string'||!(asset.url.startsWith('/assets/')||asset.url.startsWith('https://'))||asset.url.startsWith('//'))throw Error('Asset is not ready or does not match export');
 const digest=await io.verifyAssetBytes(asset,{maxBytes:b.archiveBytes});
 if(digest?.bytes!==b.archiveBytes||digest.sha256!==b.archiveSha256)throw Error('Uploaded asset digest mismatch');
 const property=await io.getProperty(b.propertyId),item=scene(property);
 await source();
 if(item.splatUrl===asset.url&&item.sizeMb===Math.max(1,Math.round(b.archiveBytes/1024/1024)))return {status:'already_attached',propertyId:b.propertyId,sceneId:b.sceneId,assetId:b.assetId,updatedAt:property.updatedAt};
 if(property.updatedAt!==b.expectedUpdatedAt||(item.splatUrl||'')!==b.previousUrl)throw Error('Property changed since attachment was planned');
 const next=structuredClone(property),target=scene(next);
 target.splatUrl=asset.url;target.sizeMb=Math.max(1,Math.round(b.archiveBytes/1024/1024));
 let result,uncertain;
 try{result=await io.saveDraft(next,{expectedUpdatedAt:b.expectedUpdatedAt});}catch(error){uncertain=error;}
 if(result?.conflict||result&&result.ok!==true)throw Error('Attachment save rejected');
 const saved=await io.getProperty(b.propertyId),actual=scene(saved);
 if(actual.splatUrl!==target.splatUrl||actual.sizeMb!==target.sizeMb)throw Error('Attachment readback mismatch',{cause:uncertain});
 await source();
 return {status:'attached',propertyId:b.propertyId,sceneId:b.sceneId,assetId:b.assetId,updatedAt:saved.updatedAt};
}
