import fs from 'node:fs';
import path from 'node:path';
const source=String.raw`F:\UNDEFINED Dropbox\UNDEFINED\Works\MFF\01_ProjectFile\3DGS\3DGS\locahun3d_Demo_point_cloud.splat`;
const dir=String.raw`F:\Codex\locahun-walk\fixtures`;
fs.mkdirSync(dir,{recursive:true});
const data=fs.readFileSync(source),count=Math.floor(data.length/32),step=Math.ceil(count/500000);
const output=Buffer.alloc(Math.ceil(count/step)*32);
let length=0;
for(let i=0;i<count;i+=step){data.copy(output,length,i*32,i*32+32);length+=32;}
fs.writeFileSync(path.join(dir,'real-scan.splat'),output.subarray(0,length));
fs.writeFileSync(path.join(dir,'provenance.json'),JSON.stringify({source,sourceBytes:data.length,sourceCount:count,stride:step,outputCount:length/32,description:'Uniform record subsample of actual supplied scan. No synthetic geometry added.'},null,2));
console.log({sourceCount:count,outputCount:length/32,bytes:length});
