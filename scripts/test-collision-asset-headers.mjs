import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../worker.js', import.meta.url), 'utf8');
const {default: worker} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const url = 'https://viewer.locahun3d.com/api/demo-asset/Kousaten_ForDemo_point_cloud.rad';
function fixture(etag = '"multipart-3"') {
  const calls = [];
  return {calls, R2_ASSETS: {async get(key, options) {
    calls.push({key, options});
    return {size: 10, httpEtag: etag, etag: 'DO-NOT-USE', uploaded: new Date('2026-09-01T12:00:00Z'),
      body: new Uint8Array(options?.range ? [2,3] : 10), range: options?.range ? {offset:2,length:2} : undefined};
  }}};
}
for (const method of ['GET', 'HEAD']) for (const range of [false, true]) {
  test(`${method} ${range ? 'range' : 'full'} returns authoritative object headers`, async () => {
    const env = fixture();
    const res = await worker.fetch(new Request(url, {method, headers: range ? {Range:'bytes=2-3'} : {}}), env);
    assert.equal(res.status, range ? 206 : 200);
    assert.equal(res.headers.get('etag'), '"multipart-3"');
    assert.equal(res.headers.get('last-modified'), 'Tue, 01 Sep 2026 12:00:00 GMT');
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.match(res.headers.get('access-control-expose-headers'), /ETag/);
    assert.equal(res.headers.get('content-length'), range ? '2' : '10');
    if (range) assert.equal(res.headers.get('content-range'), 'bytes 2-3/10');
    assert.equal((await res.arrayBuffer()).byteLength, method === 'HEAD' ? 0 : range ? 2 : 10);
    assert.equal(env.calls.length, 1);
  });
}
test('replacement at the same URL and byte count changes identity', async () => {
  const a = await worker.fetch(new Request(url, {method:'HEAD'}), fixture('"old"'));
  const b = await worker.fetch(new Request(url, {headers:{Range:'bytes=2-3'}}), fixture('"new"'));
  assert.equal(a.headers.get('etag'), '"old"');
  assert.equal(b.headers.get('etag'), '"new"');
});
test('allowlist, method restrictions, preflight and malformed range remain intact', async () => {
  for (const [target, method, headers, status] of [
    [url.replace('Kousaten_ForDemo_point_cloud.rad','private.rad'),'GET',{},404],
    [url,'PUT',{},405], [url,'OPTIONS',{},204], [url,'GET',{Range:'garbage'},400],
  ]) {
    const env = fixture();
    const res = await worker.fetch(new Request(target,{method,headers}),env);
    assert.equal(res.status,status); assert.equal(env.calls.length,0);
    assert.equal(res.headers.get('etag'),null);
    assert.equal(res.headers.get('access-control-allow-origin'),'*');
  }
});
