import fs from 'node:fs';
import vm from 'node:vm';
import inspector from 'node:inspector';
const out='F:/Codex/locahun-performance-20260911';
const bundle=fs.readFileSync(new URL('../vendor/spark-2.0.0-workers16-incrtraverse.module.js',import.meta.url),'utf8');
const a=bundle.indexOf('const jsContent = '),source=vm.runInNewContext(bundle.slice(a,bundle.indexOf('\n',a))+'\njsContent');
const encoded=source.match(/data:application\/wasm;base64,([A-Za-z0-9+/=]+)/)[1],bytes=Buffer.from(encoded,'base64');
const session=new inspector.Session();session.connect();
const post=(method,params={})=>new Promise((resolve,reject)=>session.post(method,params,(error,result)=>error?reject(error):resolve(result)));
let wasmScript;
session.on('Debugger.scriptParsed',e=>{if(e.params.scriptLanguage==='WebAssembly')wasmScript=e.params.scriptId;});
try{
 await post('Debugger.enable');
 const module=new WebAssembly.Module(bytes),imports={};for(const i of WebAssembly.Module.imports(module)){imports[i.module]??={};imports[i.module][i.name]=()=>0;}
 new WebAssembly.Instance(module,imports);
 const d=await post('Debugger.disassembleWasmModule',{scriptId:wasmScript});
 const lines=d.chunk.lines,offsets=d.chunk.bytecodeOffsets;
 if(d.streamId){while(lines.length<d.totalNumberOfLines){const next=await post('Debugger.nextWasmDisassemblyChunk',{streamId:d.streamId});for(const line of next.chunk.lines)lines.push(line);for(const offset of next.chunk.bytecodeOffsets)offsets.push(offset);}}
 const result={totalLines:lines.length,functions:{}};
 for(const index of [319,963,278,559,266]){
  const start=lines.findIndex(x=>new RegExp('\\(func \\$func'+index+'(?:\\s|\\))').test(x));
  let end=start+1;while(end<lines.length&&!/^  \(func /.test(lines[end]))end++;
  result.functions[index]={start,end,lines:lines.slice(start,end),offsets:offsets.slice(start,end)};
 }
 fs.writeFileSync(out+'/wasm-hot-functions.json',JSON.stringify(result,null,2));console.log(JSON.stringify({totalLines:result.totalLines,functions:Object.fromEntries(Object.entries(result.functions).map(([k,v])=>[k,{start:v.start,end:v.end,preview:v.lines.slice(0,8)}]))},null,2));
}finally{session.disconnect();}
