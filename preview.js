import { getLatestCapture } from './db.js';

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
const downloadBtn = document.getElementById('download');
const toastEl = document.getElementById('toast');

/** @type {null | { blob: Blob, meta: Record<string, unknown> }} */
let capture = null;
/** @type {string | null} */
let objectUrl = null;

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
    emptyEl.hidden = false;
    return;
  }

  capture = { blob: record.blob, meta: record.meta || {} };
  objectUrl = URL.createObjectURL(record.blob);
  imageEl.src = objectUrl;

  const title = String(capture.meta.title || 'Untitled page');
  const width = Number(capture.meta.width) || 0;
  const height = Number(capture.meta.height) || 0;
  document.title = `${title} · PageShot`;
  titleEl.textContent = title;
  subEl.textContent = [formatHost(capture.meta.url), width && height ? `${width} × ${height}` : '']
    .filter(Boolean)
    .join('  ·  ');

  shotEl.hidden = false;
  dockEl.hidden = false;
}

function showError(title, detail) {
  document.getElementById('error-title').textContent = title;
  document.getElementById('error-detail').textContent = detail;
  errorEl.hidden = false;
}

downloadBtn.addEventListener('click', () => {
  if (!capture) return;
  const url = objectUrl || URL.createObjectURL(capture.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameFor(capture.meta);
  document.body.appendChild(a);
  a.click();
  a.remove();
});

copyBtn.addEventListener('click', async () => {
  if (!capture) return;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ [capture.blob.type || 'image/png']: capture.blob }),
    ]);
    toast('Copied to clipboard');
  } catch {
    toast('Copy needs a user click in this tab');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'Enter' || event.key.toLowerCase() === 'd') {
    downloadBtn.click();
  } else if (event.key.toLowerCase() === 'c') {
    copyBtn.click();
  }
});

function filenameFor(meta) {
  const host = formatHost(meta?.url).replace(/\./g, '-') || 'page';
  const title = slug(meta?.title || '').slice(0, 40);
  const when = new Date(meta?.capturedAt || Date.now()).toISOString().slice(0, 10);
  return ['pageshot', title || host, when].filter(Boolean).join('-') + '.png';
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
