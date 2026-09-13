import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {REGRESSION_TESTS} from './sync-online-viewer.mjs';
test('native release explicitly includes embed, native clips and review trace CPU gates',()=>{
 for(const file of ['scripts/test-embed-viewer-native.mjs','scripts/test-avatar-existing-clips.mjs','scripts/test-avatar-motion-review-harness.mjs','scripts/test-avatar-physical-motion.mjs'])assert(REGRESSION_TESTS.includes(file),file);
});
test('standalone preview gate requires the same native CPU checks',()=>{
 const source=fs.readFileSync('F:/Codex/locahun-viewer-release-20260909/scripts/deploy-viewer-verified.mjs','utf8');
 for(const file of ['scripts/test-embed-viewer-native.mjs','scripts/test-avatar-existing-clips.mjs','scripts/test-avatar-motion-review-harness.mjs','scripts/test-avatar-physical-motion.mjs'])assert(source.includes(file),file);
});
