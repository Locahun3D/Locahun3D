import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files = process.argv.slice(2);
if (!files.length) files.push('src/js/292_demo_scene_showcase.js');
const cases = [
  ['/api/viewer-stream/assets/scan.rad', '/api/viewer-stream/assets/scan.rad'],
  ['api/viewer-stream/assets/scan.rad', '/api/viewer-stream/assets/scan.rad'],
  ['/api/r2/assets/scan.zip', '/api/viewer-stream/assets/scan.zip'],
  ['///api/r2/assets/scan.rad', '/api/viewer-stream/assets/scan.rad'],
  ['assets/scan.rad', '/api/viewer-stream/assets/scan.rad'],
  ['/uploads/scan.rad', '/api/viewer-stream/uploads/scan.rad'],
  ['/api/viewer-stream/assets/a b.rad?token=a%2Fb', '/api/viewer-stream/assets/a b.rad?token=a%2Fb'],
  ['https://example.com/scan.rad', 'https://example.com/scan.rad'],
  ['http://localhost/scan.rad', 'http://localhost/scan.rad'],
  ['blob:https://example.com/local', 'blob:https://example.com/local'],
];
let checks = 0;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('setTimeout(async ()=>{\n  const m  = location.search.match');
  assert(start >= 0, `Autoload startup not found in ${file}`);
  const end = source.indexOf('\n}, 0);', start);
  assert(end > start);
  const startup = source.slice(start, end + '\n}, 0);'.length);
  for (const protectedMode of [true, false]) for (const [url, expected] of cases) {
    let timer, loaded;
    const context = {
      location: {search: '?autoload=' + encodeURIComponent(url) + '&autoname=scan.rad'},
      _protected: protectedMode,
      setTimeout: fn => { timer = fn; },
      loadFromURL: async (...args) => { loaded = args; },
    };
    vm.runInNewContext(startup, context);
    await timer();
    assert.deepEqual(loaded, [protectedMode ? expected : url, 'scan.rad'], `${file}: protected=${protectedMode}, ${url}`);
    checks++;
  }
}
console.log(`${checks} autoload URL checks passed`);
