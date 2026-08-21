/** Local image/PDF export. No network, no third-party PDF library. */

export const JPEG_QUALITY = 0.92;
/** Acrobat-era MediaBox limit: 200 inches at 72 pt/in. */
export const MAX_PDF_POINT = 14400;
export const PDF_DPI = 96;
/** Strip height if a single JPEG encode would be too large. */
export const PDF_STRIP_PX = 4096;

/**
 * Size a one-page PDF so the capture stays under the 14,400 pt limit.
 * Our stitched canvases already cap at 16,384 px, so 96 dpi almost always fits;
 * dpi is raised only when a dimension would overflow.
 *
 * @param {number} pixelWidth
 * @param {number} pixelHeight
 */
export function pdfPageSize(pixelWidth, pixelHeight) {
  const width = Math.max(1, pixelWidth);
  const height = Math.max(1, pixelHeight);
  const dpi = Math.max(PDF_DPI, (width * 72) / MAX_PDF_POINT, (height * 72) / MAX_PDF_POINT);
  return {
    dpi,
    widthPt: (width * 72) / dpi,
    heightPt: (height * 72) / dpi,
    singlePage: (width * 72) / dpi <= MAX_PDF_POINT && (height * 72) / dpi <= MAX_PDF_POINT,
  };
}

/**
 * Decide whether a capture can live on one PDF page or must be sliced.
 * Prefer one tall page; paginate only when a page would exceed the PDF limit
 * even after raising DPI, or when the caller requests strips for memory.
 *
 * @param {number} pixelWidth
 * @param {number} pixelHeight
 * @param {{ forceStrips?: boolean, stripPx?: number }} [options]
 */
export function planPdfLayout(pixelWidth, pixelHeight, options = {}) {
  const size = pdfPageSize(pixelWidth, pixelHeight);
  const stripPx = options.stripPx || PDF_STRIP_PX;
  if (!options.forceStrips && size.singlePage) {
    return { mode: 'single', ...size, strips: [{ sy: 0, sh: pixelHeight }] };
  }
  const strips = [];
  for (let y = 0; y < pixelHeight; y += stripPx) {
    strips.push({ sy: y, sh: Math.min(stripPx, pixelHeight - y) });
  }
  return {
    mode: 'paged',
    dpi: size.dpi,
    widthPt: size.widthPt,
    heightPt: size.heightPt,
    strips,
  };
}

/**
 * @param {Blob} blob
 * @param {number} [quality]
 * @returns {Promise<Blob>}
 */
export async function blobToJpeg(blob, quality = JPEG_QUALITY) {
  const bitmap = await createImageBitmap(blob);
  try {
    return await bitmapToJpeg(bitmap, quality);
  } finally {
    bitmap.close();
  }
}

/**
 * @param {ImageBitmap} bitmap
 * @param {number} [quality]
 */
export async function bitmapToJpeg(bitmap, quality = JPEG_QUALITY) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not encode JPEG.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);
  return canvas.convertToBlob({ type: 'image/jpeg', quality });
}

/**
 * Build a PDF 1.4 file that embeds one or more JPEG images, one per page.
 * @param {Array<{ jpeg: Uint8Array, width: number, height: number, widthPt: number, heightPt: number }>} pages
 */
export function buildImagePdf(pages) {
  if (!pages.length) throw new Error('PDF has no pages.');
  const enc = new TextEncoder();
  const chunks = [enc.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = [0];

  const push = (bytes) => {
    chunks.push(bytes);
  };

  const obj = (num, body) => {
    offsets[num] = byteLength(chunks);
    push(enc.encode(`${num} 0 obj\n`));
    push(typeof body === 'string' ? enc.encode(body) : body);
    push(enc.encode('\nendobj\n'));
  };

  const count = pages.length;
  const pageIds = pages.map((_, i) => 3 + i);
  const imageIds = pages.map((_, i) => 3 + count + i);
  const contentIds = pages.map((_, i) => 3 + 2 * count + i);
  const infoId = 3 + 3 * count;

  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${count} >>`);

  pages.forEach((page, i) => {
    const w = page.widthPt.toFixed(3);
    const h = page.heightPt.toFixed(3);
    obj(
      pageIds[i],
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imageIds[i]} 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ${contentIds[i]} 0 R >>`,
    );
  });

  pages.forEach((page, i) => {
    const head = enc.encode(
      `<< /Type /XObject /Subtype /Image /Width ${Math.round(page.width)} /Height ${Math.round(page.height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
    );
    const tail = enc.encode('\nendstream');
    obj(imageIds[i], concatBytes([head, page.jpeg, tail]));
  });

  pages.forEach((page, i) => {
    const w = page.widthPt.toFixed(3);
    const h = page.heightPt.toFixed(3);
    const stream = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;
    obj(contentIds[i], `<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  });

  obj(infoId, '<< /Producer (Zen Page Shot) /Creator (Zen Page Shot) >>');

  const xrefAt = byteLength(chunks);
  const size = infoId + 1;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i < size; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  push(enc.encode(xref));
  push(
    enc.encode(
      `trailer\n<< /Size ${size} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`,
    ),
  );
  return concatBytes(chunks);
}

/**
 * Encode a capture PNG/JPEG blob as a PDF. One tall page when it fits;
 * otherwise vertical strips so Chrome never builds an illegal MediaBox.
 *
 * @param {Blob} imageBlob
 * @param {{ width?: number, height?: number }} [known]
 */
export async function captureToPdf(imageBlob, known = {}) {
  const bitmap = await createImageBitmap(imageBlob);
  const width = known.width || bitmap.width;
  const height = known.height || bitmap.height;
  const layout = planPdfLayout(width, height);

  try {
    if (layout.mode === 'single') {
      const jpeg = new Uint8Array(await (await bitmapToJpeg(bitmap)).arrayBuffer());
      return new Blob(
        [
          buildImagePdf([
            {
              jpeg,
              width,
              height,
              widthPt: layout.widthPt,
              heightPt: layout.heightPt,
            },
          ]),
        ],
        { type: 'application/pdf' },
      );
    }

    const pages = [];
    for (const strip of layout.strips) {
      const slice = await sliceBitmap(bitmap, 0, strip.sy, width, strip.sh);
      try {
        const jpeg = new Uint8Array(await (await bitmapToJpeg(slice)).arrayBuffer());
        const size = pdfPageSize(width, strip.sh);
        pages.push({
          jpeg,
          width,
          height: strip.sh,
          widthPt: size.widthPt,
          heightPt: size.heightPt,
        });
      } finally {
        slice.close();
      }
    }
    return new Blob([buildImagePdf(pages)], { type: 'application/pdf' });
  } finally {
    bitmap.close();
  }
}

async function sliceBitmap(bitmap, sx, sy, sw, sh) {
  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not slice the capture for PDF.');
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  return createImageBitmap(canvas);
}

function byteLength(parts) {
  return parts.reduce((sum, part) => sum + part.length, 0);
}

function concatBytes(parts) {
  const out = new Uint8Array(byteLength(parts));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
