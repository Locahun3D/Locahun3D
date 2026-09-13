import fs from 'node:fs';
import vm from 'node:vm';
export function shipped(){
 const bundle=fs.readFileSync(new URL('../vendor/spark-2.0.0-workers16-incrtraverse.module.js',import.meta.url),'utf8');
 const start=bundle.indexOf('const jsContent = ');
 const worker=vm.runInNewContext(bundle.slice(start,bundle.indexOf('\n',start))+'\njsContent');
 const encoded=worker.match(/data:application\/wasm;base64,([A-Za-z0-9+/=]+)/)[1];
 return {bundle,worker,encoded,bytes:Buffer.from(encoded,'base64')};
}
export function leb(n){const a=[];do{let b=n&127;n>>>=7;if(n)b|=128;a.push(b);}while(n);return Buffer.from(a);}
export function readLeb(b,c){let n=0,shift=0,x;do{x=b[c.at++];n|=(x&127)<<shift;shift+=7;}while(x&128);return n>>>0;}
export function sections(b){const out=[],c={at:8};while(c.at<b.length){const id=b[c.at++],len=readLeb(b,c),start=c.at;c.at+=len;out.push({id,data:b.subarray(start,c.at)});}return out;}
export function encodeSections(s){return Buffer.concat([Buffer.from([0,97,115,109,1,0,0,0]),...s.flatMap(x=>[Buffer.from([x.id]),leb(x.data.length),x.data])]);}
export function bodies(b){const s=sections(b).find(x=>x.id===10).data,c={at:0},count=readLeb(s,c),out=[];for(let i=0;i<count;i++){const n=readLeb(s,c);out.push(s.subarray(c.at,c.at+n));c.at+=n;}return out;}
export function replaceBody(original,index,body){const s=sections(original),code=s.find(x=>x.id===10),parts=bodies(original),imports=WebAssembly.Module.imports(new WebAssembly.Module(original)).filter(x=>x.kind==='function').length;parts[index-imports]=body;code.data=Buffer.concat([leb(parts.length),...parts.flatMap(b=>[leb(b.length),b])]);return encodeSections(s);}
export function exportFunction(original,name,index){const s=sections(original),e=s.find(x=>x.id===7),c={at:0},count=readLeb(e.data,c),n=Buffer.from(name);e.data=Buffer.concat([leb(count+1),e.data.subarray(c.at),leb(n.length),n,Buffer.from([0]),leb(index)]);return encodeSections(s);}
export function instantiate(bytes){const m=new WebAssembly.Module(bytes),imports={};for(const x of WebAssembly.Module.imports(m)){imports[x.module]??={};imports[x.module][x.name]=()=>0;}return new WebAssembly.Instance(m,imports);}
