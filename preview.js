import { getLatestCapture } from './db.js';
import { blobToJpeg, captureToPdf, JPEG_QUALITY } from './export.js';

const params = new URLSearchParams(location.search);
const errorCode = params.get('error');
const errorDetail = params.get('detail');

const emptyEl = document.getElementById('empty');
const errorEl = document.getElementById('error');
const shotEl = document.getElementById('shot');
const dockEl = document.getElementById('dock');
const imageEl = document.getElementById('image');
const titleEl = document.getElementById('page-title');
const subEl = document.getElementById('page-sub');
const copyBtn = document.getElementById('copy');
const jpgBtn = document.getElementById('download-jpg');
const pdfBtn = document.getElementById('download-pdf');
const downloadBtn = document.getElementById('download');
const toastEl = document.getElementById('toast');
const actionButtons = [copyBtn, jpgBtn, pdfBtn, downloadBtn];

/** @type {null | { blob: Blob, meta: Record<string, unknown> }} */
let capture = null;
/** @type {string | null} */
let objectUrl = null;
let busy = false;

init().catch((error) => {
  showError('Something went wrong', error instanceof Error ? error.message : String(error));
});

async function init() {
  if (errorCode === 'restricted') {
    showError(
      'This page can’t be captured',
      'Chrome blocks screenshots of its own pages and the Web Store. Open a regular website and try again.',
    );
    return;
  }
  if (errorCode === 'failed') {
    showError('Capture didn’t finish', errorDetail || 'Try the page again in a moment.');
    return;
  }

  const record = await getLatestCapture();
  if (!record?.blob) {
    return;
  }

  capture = { blob: record.blob, meta: record.meta || {} };
  objectUrl = URL.createObjectURL(record.blob);
  imageEl.src = objectUrl;

  const title = String(capture.meta.title || 'Untitled page');
  const width = Number(capture.meta.width) || 0;
  const height = Number(capture.meta.height) || 0;
  document.title = `${title} · Zen Page Shot`;
  titleEl.textContent = title;
  subEl.textContent = [formatHost(capture.meta.url), width && height ? `${width} × ${height}` : '']
    .filter(Boolean)
    .join('  ·  ');

  emptyEl.hidden = true;
  shotEl.hidden = false;
  dockEl.hidden = false;
}

function showError(title, detail) {
  document.getElementById('error-title').textContent = title;
  document.getElementById('error-detail').textContent = detail;
  emptyEl.hidden = true;
  errorEl.hidden = false;
}

downloadBtn.addEventListener('click', () => {
  if (!capture) return;
  saveBlob(capture.blob, filenameFor(capture.meta, 'png'));
});

jpgBtn.addEventListener('click', () => {
  void withBusy(async () => {
    toast('Preparing JPG…');
    const jpeg = await blobToJpeg(capture.blob, JPEG_QUALITY);
    saveBlob(jpeg, filenameFor(capture.meta, 'jpg'));
    toast('JPG saved');
  }, 'Could not make a JPG');
});

pdfBtn.addEventListener('click', () => {
  void withBusy(async () => {
    toast('Preparing PDF…');
    const pdf = await captureToPdf(capture.blob, {
      width: Number(capture.meta.width) || undefined,
      height: Number(capture.meta.height) || undefined,
    });
    saveBlob(pdf, filenameFor(capture.meta, 'pdf'));
    toast('PDF saved');
  }, 'Could not make a PDF');
});

copyBtn.addEventListener('click', () => {
  void withBusy(async () => {
    await navigator.clipboard.write([
      new ClipboardItem({ [capture.blob.type || 'image/png']: capture.blob }),
    ]);
    toast('Copied PNG to clipboard');
  }, 'Copy needs a user click in this tab');
});

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (event.key === 'Enter' || key === 'd') downloadBtn.click();
  else if (key === 'j') jpgBtn.click();
  else if (key === 'p') pdfBtn.click();
  else if (key === 'c') copyBtn.click();
});

async function withBusy(work, failMessage) {
  if (!capture || busy) return;
  busy = true;
  for (const button of actionButtons) button.disabled = true;
  try {
    await work();
  } catch {
    toast(failMessage);
  } finally {
    busy = false;
    for (const button of actionButtons) button.disabled = false;
  }
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function filenameFor(meta, ext) {
  const host = formatHost(meta?.url).replace(/\./g, '-') || 'page';
  const title = slug(meta?.title || '').slice(0, 40);
  const when = new Date(meta?.capturedAt || Date.now()).toISOString().slice(0, 10);
  return ['zen-page-shot', title || host, when].filter(Boolean).join('-') + `.${ext}`;
}

function formatHost(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

let toastTimer = 0;
function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.hidden = true;
  }, 1800);
}

window.addEventListener('beforeunload', () => {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});
