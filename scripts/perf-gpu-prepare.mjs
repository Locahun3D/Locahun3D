import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),out='F:/Codex/locahun-performance-20260911';
const hash=b=>createHash('sha256').update(b).digest('hex');
const baseline=JSON.parse(fs.readFileSync(out+'/final-before.json'));
const project=baseline.project,projectState=fs.readFileSync(project+'/project-state.json','utf8');
const template=fs.readFileSync(root+'/src/template.html','utf8'),fragments={};
for(const match of template.matchAll(/\{\{include(?:-variant)?:([^}]+)\}\}/g))fragments[match[1]]=fs.readFileSync(path.join(root,match[1]),'utf8');
const source=fs.readFileSync(root+'/vendor/spark-2.0.0-workers16-incrtraverse.module.js');
const candidate=fs.readFileSync(out+'/spark-heap-candidate.module.js');
const manifest=JSON.parse(fs.readFileSync(out+'/heap-candidate-manifest.json'));
assert.equal(hash(source),manifest.originalBundleSha256);assert.equal(hash(candidate),manifest.candidateBundleSha256);
const assets={};
for(const entry of JSON.parse(projectState).project.layers){if(!entry.file)continue;assert(/^assets\/[a-zA-Z0-9._-]+$/.test(entry.file));const file=path.join(project,entry.file),stat=fs.statSync(file);assets['/'+entry.file]={size:stat.size,mtimeMs:stat.mtimeMs,sha256:hash(fs.readFileSync(file))};}
fs.writeFileSync(out+'/heap-original.module.js',source);
fs.writeFileSync(out+'/heap-gpu-snapshot.json',JSON.stringify({template,fragments,project,projectState,projectStateHash:hash(projectState),assets,manifest,viewport:{width:1440,height:900},camera:baseline.initial.pose,collision:false,created:new Date().toISOString()}));
console.log('CPU preparation complete; no browser/GPU opened. Frozen assets:',Object.keys(assets));
