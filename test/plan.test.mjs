import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  deviceRect,
  fitCanvas,
  isRestrictedUrl,
  MAX_CANVAS_AREA,
  MAX_CANVAS_DIM,
  MAX_SLICES,
  planSlices,
} from '../plan.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('single viewport is one full tile', () => {
  const slices = planSlices({
    pageWidth: 1200,
    pageHeight: 800,
    viewportWidth: 1200,
    viewportHeight: 800,
  });
  assert.equal(slices.length, 1);
  assert.deepEqual(slices[0], {
    scrollX: 0,
    scrollY: 0,
    sx: 0,
    sy: 0,
    sw: 1200,
    sh: 800,
    dx: 0,
    dy: 0,
  });
});

test('tall page tiles vertically and crops the last remainder', () => {
  const slices = planSlices({
    pageWidth: 1000,
    pageHeight: 2500,
    viewportWidth: 1000,
    viewportHeight: 1000,
  });
  assert.equal(slices.length, 3);
  assert.equal(slices[0].scrollY, 0);
  assert.equal(slices[1].scrollY, 1000);
  assert.equal(slices[2].scrollY, 1500);
  assert.equal(slices[2].sy, 500);
  assert.equal(slices[2].sh, 500);
  assert.equal(slices[2].dy, 2000);
});

test('wide page tiles horizontally', () => {
  const slices = planSlices({
    pageWidth: 2000,
    pageHeight: 800,
    viewportWidth: 1200,
    viewportHeight: 800,
  });
  assert.equal(slices.length, 2);
  assert.equal(slices[1].scrollX, 800);
  assert.equal(slices[1].sx, 400);
  assert.equal(slices[1].sw, 800);
});

test('slice count is capped', () => {
  const slices = planSlices({
    pageWidth: 800,
    pageHeight: 800 * (MAX_SLICES + 20),
    viewportWidth: 800,
    viewportHeight: 800,
  });
  assert.equal(slices.length, MAX_SLICES);
});

test('fitCanvas shrinks extreme pages inside Chrome limits', () => {
  const fitted = fitCanvas(8000, 40000);
  assert.ok(fitted.width <= MAX_CANVAS_DIM);
  assert.ok(fitted.height <= MAX_CANVAS_DIM);
  assert.ok(fitted.width * fitted.height <= MAX_CANVAS_AREA);
  assert.ok(fitted.scale < 1);
});

test('deviceRect maps CSS tiles onto the captured bitmap', () => {
  const slice = {
    scrollX: 0,
    scrollY: 1500,
    sx: 0,
    sy: 500,
    sw: 1000,
    sh: 500,
    dx: 0,
    dy: 2000,
  };
  const rect = deviceRect(slice, 0, 0, 2, 1);
  assert.deepEqual(rect, {
    sx: 0,
    sy: 1000,
    sw: 2000,
    sh: 1000,
    dx: 0,
    dy: 4000,
    dw: 2000,
    dh: 1000,
  });
});

test('restricted URLs are rejected', () => {
  assert.equal(isRestrictedUrl('chrome://extensions'), true);
  assert.equal(isRestrictedUrl('https://chromewebstore.google.com/detail/x'), true);
  assert.equal(isRestrictedUrl('https://example.com/article'), false);
});

test('manifest is valid MV3 PageShot and files exist', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'PageShot');
  assert.ok(!/gofullpage|full page screen capture/i.test(JSON.stringify(manifest)));
  assert.ok(manifest.background.service_worker);
  assert.equal(manifest.background.type, 'module');
  assert.ok(manifest.permissions.includes('activeTab'));
  assert.ok(manifest.permissions.includes('scripting'));
  assert.ok(!manifest.permissions.includes('tabs'));
  assert.ok(!manifest.host_permissions);

  for (const file of [
    'background.js',
    'content.js',
    'plan.js',
    'db.js',
    'preview.html',
    'preview.css',
    'preview.js',
    'icons/icon16.png',
    'icons/icon32.png',
    'icons/icon48.png',
    'icons/icon128.png',
  ]) {
    readFileSync(join(root, file));
  }
});
