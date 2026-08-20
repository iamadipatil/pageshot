/** Pure capture-planning helpers. No Chrome APIs — safe to unit-test. */

export const MAX_SLICES = 80;
export const MAX_CSS_HEIGHT = 20000;
export const MAX_CANVAS_DIM = 16384;
export const MAX_CANVAS_AREA = 64 * 1024 * 1024;

/**
 * Tile a page into viewport-sized captures.
 * Last row/column may be a partial tile; scroll is clamped and the crop
 * (`sx`/`sy`) picks the matching pixels out of the captured viewport.
 *
 * @param {{ pageWidth: number, pageHeight: number, viewportWidth: number, viewportHeight: number }} metrics
 * @returns {Array<{ scrollX: number, scrollY: number, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number }>}
 */
export function planSlices(metrics) {
  const vw = Math.max(1, Math.floor(metrics.viewportWidth));
  const vh = Math.max(1, Math.floor(metrics.viewportHeight));
  const pw = Math.max(vw, Math.ceil(metrics.pageWidth));
  const ph = Math.max(vh, Math.ceil(metrics.pageHeight));

  const maxScrollX = Math.max(0, pw - vw);
  const maxScrollY = Math.max(0, ph - vh);
  const slices = [];

  for (let destY = 0; destY < ph && slices.length < MAX_SLICES; destY += vh) {
    const tileH = Math.min(vh, ph - destY);
    for (let destX = 0; destX < pw && slices.length < MAX_SLICES; destX += vw) {
      const tileW = Math.min(vw, pw - destX);
      const scrollX = Math.min(destX, maxScrollX);
      const scrollY = Math.min(destY, maxScrollY);
      slices.push({
        scrollX,
        scrollY,
        sx: destX - scrollX,
        sy: destY - scrollY,
        sw: tileW,
        sh: tileH,
        dx: destX,
        dy: destY,
      });
    }
  }

  return slices;
}

/**
 * Scale an output canvas so it stays within Chromium's dimension/area limits.
 * @param {number} width
 * @param {number} height
 */
export function fitCanvas(width, height) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const scale = Math.min(
    1,
    MAX_CANVAS_DIM / w,
    MAX_CANVAS_DIM / h,
    Math.sqrt(MAX_CANVAS_AREA / (w * h)),
  );
  return {
    width: Math.max(1, Math.floor(w * scale)),
    height: Math.max(1, Math.floor(h * scale)),
    scale,
  };
}

/**
 * Device-pixel crop/draw rect for one slice, including a scroller's
 * visible offset inside the browser viewport (0,0 for window scroll).
 */
export function deviceRect(slice, captureLeft, captureTop, deviceScale, outputScale) {
  const s = deviceScale;
  const o = deviceScale * outputScale;
  return {
    sx: Math.round((captureLeft + slice.sx) * s),
    sy: Math.round((captureTop + slice.sy) * s),
    sw: Math.max(1, Math.round(slice.sw * s)),
    sh: Math.max(1, Math.round(slice.sh * s)),
    dx: Math.round(slice.dx * o),
    dy: Math.round(slice.dy * o),
    dw: Math.max(1, Math.round(slice.sw * o)),
    dh: Math.max(1, Math.round(slice.sh * o)),
  };
}

export function clampPageHeight(height) {
  return Math.min(MAX_CSS_HEIGHT, Math.max(1, Math.ceil(height)));
}

/**
 * Chrome cannot capture these surfaces — they never reach the page renderer
 * in a way `captureVisibleTab` can see, or the URL is privileged.
 * @param {string | undefined} url
 */
export function isRestrictedUrl(url) {
  if (!url) return true;
  if (/^(chrome|chrome-extension|edge|about|devtools|view-source|data|javascript|chrome-search|chrome-untrusted):/i.test(url)) {
    return true;
  }
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'chromewebstore.google.com') return true;
    if (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) {
      return true;
    }
  } catch {
    return true;
  }
  return false;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
