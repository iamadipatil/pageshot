import {
  clampPageHeight,
  deviceRect,
  fitCanvas,
  isRestrictedUrl,
  planSlices,
  sleep,
} from './plan.js';
import { putLatestCapture } from './db.js';

let capturing = false;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'pageshot-capture') return;
  // Held open by the page agent so the service worker stays alive mid-capture.
});

chrome.action.onClicked.addListener((tab) => {
  void startCapture(tab);
});

async function startCapture(tab) {
  if (capturing) return;
  capturing = true;

  const tabId = tab.id;
  try {
    if (tabId == null || isRestrictedUrl(tab.url)) {
      await openPreview('restricted');
      return;
    }

    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#C45C2A' });
    await chrome.action.setBadgeText({ tabId, text: '…' });
    await chrome.action.setTitle({ tabId, title: 'PageShot — capturing…' });

    await chrome.tabs.update(tabId, { active: true });
    const live = await chrome.tabs.get(tabId);

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });

    const prepared = await send(tabId, { type: 'prepare' });
    if (!prepared?.ok) {
      throw new Error(prepared?.error || 'This page could not be prepared for capture.');
    }

    let metrics = prepared;
    if (metrics.pageHeight > metrics.viewportHeight * 1.15) {
      const warmed = await send(tabId, { type: 'warmup' });
      if (warmed?.ok) metrics = warmed;
    }

    metrics = normalizeMetrics(metrics);
    const slices = planSlices(metrics);
    if (!slices.length) throw new Error('Nothing to capture on this page.');

    let canvas = null;
    let ctx = null;
    let deviceScale = 1;
    let outputScale = 1;

    for (let i = 0; i < slices.length; i += 1) {
      await chrome.action.setBadgeText({ tabId, text: String(i + 1) });

      if (i === 1) {
        await send(tabId, { type: 'hideRepeats' });
      }

      const slice = slices[i];
      await chrome.tabs.update(tabId, { active: true });
      const scrolled = await send(tabId, { type: 'scroll', x: slice.scrollX, y: slice.scrollY });
      if (!scrolled?.ok) throw new Error(scrolled?.error || 'Could not scroll the page.');

      await sleep(80);

      const current = await chrome.tabs.get(tabId);
      const dataUrl = await captureWithRetry(current.windowId);
      const bitmap = await dataUrlToBitmap(dataUrl);

      if (!canvas) {
        deviceScale = bitmap.width / Math.max(1, metrics.windowInnerWidth);
        const fitted = fitCanvas(
          Math.round(metrics.pageWidth * deviceScale),
          Math.round(metrics.pageHeight * deviceScale),
        );
        outputScale = fitted.scale;
        ({ canvas, ctx } = makeCanvas(fitted.width, fitted.height));
      }

      const rect = deviceRect(
        slice,
        scrolled.captureLeft ?? 0,
        scrolled.captureTop ?? 0,
        deviceScale,
        outputScale,
      );
      drawSlice(ctx, bitmap, rect);
      bitmap.close();
    }

    await send(tabId, { type: 'restore' }).catch(() => {});

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    await putLatestCapture({
      blob,
      meta: {
        title: metrics.title || live.title || 'Untitled',
        url: metrics.url || live.url || '',
        width: canvas.width,
        height: canvas.height,
        slices: slices.length,
        capturedAt: Date.now(),
      },
    });

    await openPreview();
  } catch (error) {
    await send(tabId, { type: 'restore' }).catch(() => {});
    const reason = error instanceof Error ? error.message : String(error);
    await openPreview('failed', reason);
  } finally {
    capturing = false;
    if (tabId != null) {
      await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
      await chrome.action.setTitle({ tabId, title: 'PageShot — capture this page' }).catch(() => {});
    }
  }
}

function normalizeMetrics(raw) {
  const viewportWidth = Math.max(1, Math.floor(raw.viewportWidth || 1));
  const viewportHeight = Math.max(1, Math.floor(raw.viewportHeight || 1));
  return {
    title: raw.title,
    url: raw.url,
    windowInnerWidth: Math.max(1, Math.floor(raw.windowInnerWidth || viewportWidth)),
    viewportWidth,
    viewportHeight,
    pageWidth: Math.max(viewportWidth, Math.ceil(raw.pageWidth || viewportWidth)),
    pageHeight: clampPageHeight(Math.max(viewportHeight, raw.pageHeight || viewportHeight)),
    captureLeft: raw.captureLeft || 0,
    captureTop: raw.captureTop || 0,
  };
}

function makeCanvas(width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not allocate a capture canvas.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function drawSlice(ctx, bitmap, rect) {
  const sx = clamp(rect.sx, 0, Math.max(0, bitmap.width - 1));
  const sy = clamp(rect.sy, 0, Math.max(0, bitmap.height - 1));
  const sw = clamp(rect.sw, 1, bitmap.width - sx);
  const sh = clamp(rect.sh, 1, bitmap.height - sy);
  ctx.drawImage(bitmap, sx, sy, sw, sh, rect.dx, rect.dy, rect.dw, rect.dh);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function dataUrlToBitmap(dataUrl) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

async function captureWithRetry(windowId) {
  let lastError = new Error('Capture failed.');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await sleep(180 * (attempt + 1));
    }
  }
  throw lastError;
}

function send(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

async function openPreview(error, detail) {
  const params = new URLSearchParams();
  if (error) params.set('error', error);
  if (detail) params.set('detail', detail.slice(0, 240));
  const query = params.toString();
  const url = chrome.runtime.getURL(query ? `preview.html?${query}` : 'preview.html');
  await chrome.tabs.create({ url });
}
