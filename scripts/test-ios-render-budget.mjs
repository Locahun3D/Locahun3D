import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = name => fs.readFileSync(new URL('../src/js/' + name, import.meta.url), 'utf8');
const state = source('010_state.js');
const identity = state.slice(state.indexOf('const _ua ='), state.indexOf('const _isMac ='));
assert.ok(identity.includes('const _isIPad'));
const tier = source('020_splat_perf_tier_drives_spark_splat_tunin.js');
const renderer = source('030_renderer_scene.js').split('scene.add(sparkRenderer);')[0];
const prefetch = source('294_rad_lod_prefetch.js');
const quality = source('410_ui_controls.js').split('window.setQuality=function')[0];

function fixture({ ua, platform, touch, mobile, width = 1024, height = 768 }) {
  const callbacks = [];
  const context = vm.createContext({
    navigator: { userAgent: ua, platform, maxTouchPoints: touch },
    isMobile: mobile, innerWidth: width, innerHeight: height,
    devicePixelRatio: 2, qualScale: .75, qualIdx: 0, _heavyDisplay: false,
    _isMac: platform === 'MacIntel' && !mobile, canvas: {},
    THREE: {
      Clock: class {}, Quaternion: class {}, Vector3: class {},
      Scene: class { add() {} },
      WebGLRenderer: class { setPixelRatio() {} setSize() {} setClearColor() {} },
    },
    SparkRenderer: class { constructor(options) { Object.assign(this, options); } },
    console: { info() {} }, window: {}, renderer: null, scene: null,
    layers: [{ _isMain: true, mesh: { paged: true } }],
    _sceneSettledForCalibration: () => true,
    performance: { now: () => 1000 }, setInterval: fn => callbacks.push(fn),
    _pendingPixelRatio: null, _qualPreferred: .75,
    _queuePixelRatio() {}, markDirty() {}, T: x => x,
    document: { getElementById: () => null, querySelectorAll: () => [] },
  });
  vm.runInContext(identity + '\n' + tier + '\n' + renderer + '\n' + prefetch + '\n' + quality, context);
  callbacks.forEach(fn => fn());
  return { context, read: expression => vm.runInContext(expression, context) };
}

const cases = [
  ['iPhone', { ua: 'iPhone', platform: 'iPhone', touch: 5, mobile: true, width: 390, height: 844 }, 'phone'],
  ['iPad mobile UA', { ua: 'iPad', platform: 'iPad', touch: 5, mobile: true }, 'tablet'],
  ['iPad desktop UA', { ua: 'Macintosh', platform: 'MacIntel', touch: 5, mobile: true }, 'tablet'],
  ['iPad with pointer', { ua: 'Macintosh', platform: 'MacIntel', touch: 5, mobile: false }, 'tablet'],
  ['iPad narrow split view', { ua: 'Macintosh', platform: 'MacIntel', touch: 5, mobile: false, width: 500 }, 'tablet'],
];
for (const [name, device, expectedTier] of cases) {
  test(name + ': bounded iOS resources, no desktop prewarm, input unchanged', () => {
    const f = fixture(device);
    assert.equal(f.read('_splatPerfTier'), expectedTier);
    assert.equal(f.read('sparkRenderer.lodSplatCount'), 1500000);
    assert.equal(f.read('sparkRenderer.maxPagedSplats'), 96 * 65536);
    assert.equal(f.read('sparkRenderer.numLodFetchers'), 6);
    assert.equal(f.read('window.__lodPrefetch.phase'), 'wait');
    assert.equal(f.read('isMobile'), device.mobile);
    for (const actor of ['manual', 'watchdog', 'calibration', 'battery']) {
      for (const level of [0, 1, 2, 1, 0]) {
        f.read(`applyQualityTier(${level}, {source:'${actor}', immediate:${actor === 'manual'}})`);
        assert.equal(f.read('sparkRenderer.lodSplatCount'), 1500000, actor + ':' + level);
      }
    }
  });
}
test('MacBook without touch retains desktop defaults and prewarm', () => {
  const f = fixture({ ua: 'Macintosh', platform: 'MacIntel', touch: 0, mobile: false });
  assert.equal(f.read('_splatPerfTier'), 'desktop');
  assert.equal(f.read('sparkRenderer.lodSplatCount'), undefined);
  assert.equal(f.read('sparkRenderer.maxPagedSplats'), undefined);
  assert.equal(f.read('sparkRenderer.numLodFetchers'), 16);
  assert.equal(f.read('window.__lodPrefetch.phase'), 'sweep');
  f.read("applyQualityTier(2, {source:'manual', immediate:true})");
  assert.equal(f.read('sparkRenderer.lodSplatCount'), 5000000);
  f.read("applyQualityTier(0, {source:'watchdog'})");
  assert.equal(f.read('sparkRenderer.lodSplatCount'), undefined);
});
test('Android defaults are not replaced with iOS limits', () => {
  const f = fixture({ ua: 'Android Mobile', platform: 'Linux armv8l', touch: 5, mobile: true, width: 400 });
  assert.equal(f.read('_splatPerfTier'), 'phone');
  assert.equal(f.read('sparkRenderer.lodSplatCount'), undefined);
  assert.equal(f.read('sparkRenderer.maxPagedSplats'), undefined);
  assert.equal(f.read('sparkRenderer.numLodFetchers'), 6);
});
test('explicit limits match shipped Spark iOS defaults, not invented lower budgets', () => {
  const vendor = fs.readFileSync(new URL('../vendor/spark-2.0.0-workers16-incrtraverse-heap319-v1.module.js', import.meta.url), 'utf8');
  assert.ok(vendor.includes('isIos() ? 15e5 : 25e5'));
  assert.ok(vendor.includes('const defaultPages = isMobile() ? isIos() ? 96 : 128 : 256;'));
  assert.ok(vendor.includes('this.maxPagedSplats = options.maxPagedSplats ?? defaultPages * 65536;'));
});
