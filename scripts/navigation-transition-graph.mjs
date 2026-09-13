// Use the same bounded codec as the browser candidate.
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const context=vm.createContext({Uint8Array,TextEncoder,TextDecoder,structuredClone});
vm.runInContext(fs.readFileSync(new URL('../src/js/403n_navigation_transition_graph.js',import.meta.url),'utf8'),context);
const codec=context.LocahunTransitionGraph.create(bytes=>createHash('sha256').update(bytes).digest('hex'));
export const encodeTransitionGraph=codec.encode;
export const decodeTransitionGraph=codec.decode;
