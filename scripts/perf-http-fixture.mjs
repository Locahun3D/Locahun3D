export function assetResponse({size,sha256},method,range){
 const headers={'Content-Type':'application/octet-stream','Accept-Ranges':'bytes','ETag':'"sha256-'+sha256+'"','X-Content-SHA256':sha256,'Cache-Control':'no-cache'};
 const match=range&&/^bytes=(\d+)-(\d*)$/.exec(range);
 if(range&&!match)return {status:416,headers:{...headers,'Content-Range':'bytes */'+size},bytes:0};
 const start=match?Number(match[1]):0,end=match&&match[2]?Math.min(Number(match[2]),size-1):size-1;
 if(!Number.isSafeInteger(start)||start>end)return {status:416,headers:{...headers,'Content-Range':'bytes */'+size},bytes:0};
 return {status:match?206:200,start,end,bytes:method==='HEAD'?0:end-start+1,headers:{...headers,'Content-Length':end-start+1,...(match?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})}};
}
