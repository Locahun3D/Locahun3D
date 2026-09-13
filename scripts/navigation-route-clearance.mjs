import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../src/js/403o_navigation_route_clearance.js',import.meta.url),'utf8'),context);
export const verifyRouteClearance=context.LocahunRouteClearance;
