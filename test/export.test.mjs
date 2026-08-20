import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildImagePdf,
  JPEG_QUALITY,
  MAX_PDF_POINT,
  PDF_DPI,
  pdfPageSize,
  planPdfLayout,
} from '../export.js';

test('JPEG quality is high enough to avoid obvious banding', () => {
  assert.equal(JPEG_QUALITY, 0.92);
});

test('ordinary captures stay on one 96 dpi PDF page', () => {
  const size = pdfPageSize(1280, 4000);
  assert.equal(size.dpi, PDF_DPI);
  assert.equal(size.singlePage, true);
  assert.ok(size.heightPt < MAX_PDF_POINT);
  assert.ok(Math.abs(size.widthPt - (1280 * 72) / 96) < 0.01);
});

test('extreme pixel sizes raise dpi instead of overflowing MediaBox', () => {
  const size = pdfPageSize(8000, 40000);
  assert.ok(size.dpi > PDF_DPI);
  assert.ok(size.heightPt <= MAX_PDF_POINT + 0.001);
  assert.ok(size.widthPt <= MAX_PDF_POINT + 0.001);
});

test('layout paginates only when forced or illegal as one page', () => {
  const single = planPdfLayout(900, 2200);
  assert.equal(single.mode, 'single');
  assert.equal(single.strips.length, 1);

  const paged = planPdfLayout(900, 9000, { forceStrips: true, stripPx: 4000 });
  assert.equal(paged.mode, 'paged');
  assert.equal(paged.strips.length, 3);
  assert.equal(paged.strips[2].sh, 1000);
});

test('PDF bytes are a well-formed single-page document', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = buildImagePdf([
    { jpeg, width: 200, height: 800, widthPt: 150, heightPt: 600 },
  ]);
  const text = new TextDecoder('latin1').decode(pdf);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.match(text, /\/Type \/Catalog/);
  assert.match(text, /\/MediaBox \[0 0 150.000 600.000\]/);
  assert.match(text, /\/Filter \/DCTDecode/);
  assert.match(text, /\/Producer \(Zen Page Shot\)/);
  assert.match(text, /%%EOF/);
  assert.equal(pdf[pdf.length - 1], 0x0a);
});

test('paged PDF lists every strip', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = buildImagePdf([
    { jpeg, width: 100, height: 100, widthPt: 72, heightPt: 72 },
    { jpeg, width: 100, height: 50, widthPt: 72, heightPt: 36 },
  ]);
  const text = new TextDecoder('latin1').decode(pdf);
  assert.match(text, /\/Count 2/);
  assert.match(text, /\/MediaBox \[0 0 72.000 36.000\]/);
});
