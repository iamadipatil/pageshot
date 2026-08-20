/**
 * PageShot page agent.
 * Injected into the isolated world. Scrolls, measures, and temporarily
 * tames sticky chrome so a full-page stitch does not repeat headers.
 */
(() => {
  if (globalThis.__pageshotAgent) return;
  globalThis.__pageshotAgent = true;

  const STYLE_ID = 'pageshot-capture-style';
  const REPEAT_ATTR = 'data-pageshot-repeat';
  const MAX_WALK = 8000;

  /** @type {null | { kind: 'window' } | { kind: 'element', el: Element }} */
  let scroller = null;
  /** @type {null | { scrollX: number, scrollY: number, htmlClass: string, styleEl: boolean }} */
  let snapshot = null;
  /** @type {Element[]} */
  let marked = [];
  /** @type {chrome.runtime.Port | null} */
  let keepAlive = null;

  function connectKeepAlive() {
    if (keepAlive) return;
    keepAlive = chrome.runtime.connect({ name: 'pageshot-capture' });
    keepAlive.onDisconnect.addListener(() => {
      keepAlive = null;
    });
  }

  function disconnectKeepAlive() {
    try {
      keepAlive?.disconnect();
    } catch {
      // already gone
    }
    keepAlive = null;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function frames(count = 2) {
    return new Promise((resolve) => {
      const step = (left) => {
        if (left <= 0) {
          resolve();
          return;
        }
        requestAnimationFrame(() => step(left - 1));
      };
      step(count);
    });
  }

  function windowScrollerElement() {
    return document.scrollingElement || document.documentElement;
  }

  function isScrollable(el) {
    if (!(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    const oy = style.overflowY;
    const ox = style.overflowX;
    const y = (oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight + 8;
    const x = (ox === 'auto' || ox === 'scroll' || ox === 'overlay') && el.scrollWidth > el.clientWidth + 8;
    return y || x;
  }

  function findElementScroller() {
    if (!document.body) return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let best = null;
    let bestScore = 0;
    walkElements(document.body, (el) => {
      if (!isScrollable(el)) return;
      const rect = el.getBoundingClientRect();
      if (rect.height < vh * 0.5 || rect.width < vw * 0.45) return;
      const score = el.scrollHeight * Math.min(rect.width, vw);
      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    });
    return best;
  }

  function resolveScroller() {
    const doc = windowScrollerElement();
    const docScrolls =
      doc.scrollHeight > window.innerHeight + 8 ||
      doc.scrollWidth > window.innerWidth + 8 ||
      document.body?.scrollHeight > window.innerHeight + 8;
    if (docScrolls) {
      scroller = { kind: 'window' };
      return;
    }
    const el = findElementScroller();
    scroller = el ? { kind: 'element', el } : { kind: 'window' };
  }

  function walkElements(root, visit) {
    const budget = { left: MAX_WALK };
    const visitRoot = (node) => {
      if (!node || budget.left <= 0) return;
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
      let current = node instanceof Element ? node : walker.nextNode();
      if (node instanceof Element) visit(node);
      while (budget.left > 0 && (current = walker.nextNode())) {
        budget.left -= 1;
        visit(current);
        if (current.shadowRoot) visitRoot(current.shadowRoot);
      }
    };
    visitRoot(root);
  }

  function measure() {
    if (!scroller) resolveScroller();

    if (scroller.kind === 'element') {
      const el = scroller.el;
      const rect = el.getBoundingClientRect();
      return {
        pageWidth: Math.max(el.clientWidth, el.scrollWidth),
        pageHeight: Math.max(el.clientHeight, el.scrollHeight),
        viewportWidth: Math.max(1, el.clientWidth),
        viewportHeight: Math.max(1, el.clientHeight),
        captureLeft: rect.left,
        captureTop: rect.top,
        scrollX: el.scrollLeft,
        scrollY: el.scrollTop,
        dpr: window.devicePixelRatio || 1,
        title: document.title || 'Untitled',
        url: location.href,
      };
    }

    const doc = windowScrollerElement();
    const body = document.body;
    const pageWidth = Math.max(
      doc.scrollWidth,
      body?.scrollWidth || 0,
      doc.offsetWidth,
      window.innerWidth,
    );
    const pageHeight = Math.max(
      doc.scrollHeight,
      body?.scrollHeight || 0,
      doc.offsetHeight,
      window.innerHeight,
    );
    return {
      pageWidth,
      pageHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      captureLeft: 0,
      captureTop: 0,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      dpr: window.devicePixelRatio || 1,
      title: document.title || 'Untitled',
      url: location.href,
    };
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      html.pageshot-capturing, html.pageshot-capturing body {
        scroll-behavior: auto !important;
        scroll-snap-type: none !important;
        scrollbar-width: none !important;
      }
      html.pageshot-capturing::-webkit-scrollbar,
      html.pageshot-capturing *::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
        display: none !important;
      }
      html.pageshot-hide-repeat [${REPEAT_ATTR}] {
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function markRepeatingChrome() {
    marked = [];
    const root = document.body;
    if (!root) return;
    const viewArea = window.innerWidth * window.innerHeight;
    walkElements(root, (el) => {
      const style = getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'sticky') return;
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      if (rect.width * rect.height > viewArea * 0.85) return;
      el.setAttribute(REPEAT_ATTR, '');
      marked.push(el);
    });
  }

  function unmarkRepeatingChrome() {
    for (const el of marked) {
      el.removeAttribute(REPEAT_ATTR);
    }
    marked = [];
    document.documentElement.classList.remove('pageshot-hide-repeat');
  }

  async function scrollToPoint(x, y) {
    const left = Math.max(0, x);
    const top = Math.max(0, y);
    if (scroller?.kind === 'element') {
      const el = scroller.el;
      if (typeof el.scrollTo === 'function') {
        el.scrollTo({ left, top, behavior: 'instant' });
      } else {
        el.scrollLeft = left;
        el.scrollTop = top;
      }
    } else if (typeof window.scrollTo === 'function') {
      window.scrollTo({ left, top, behavior: 'instant' });
    } else {
      windowScrollerElement().scrollLeft = left;
      windowScrollerElement().scrollTop = top;
    }
    await frames(2);
  }

  function visibleMedia() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const hits = [];
    for (const img of document.images) {
      const rect = img.getBoundingClientRect();
      if (rect.bottom < -80 || rect.top > vh + 80 || rect.right < -80 || rect.left > vw + 80) {
        continue;
      }
      hits.push(img);
    }
    return hits;
  }

  async function waitForVisibleImages(timeoutMs) {
    const pending = visibleMedia().filter((img) => !img.complete);
    if (!pending.length) return;
    await Promise.race([
      Promise.all(
        pending.map((img) => {
          if (typeof img.decode === 'function') return img.decode().catch(() => {});
          return new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        }),
      ),
      sleep(timeoutMs),
    ]);
  }

  async function settle(timeoutMs = 1100) {
    await frames(2);
    await waitForVisibleImages(timeoutMs);
    await frames(1);
    await sleep(90);
  }

  async function prepare() {
    await restore(false);
    connectKeepAlive();
    resolveScroller();
    snapshot = {
      scrollX: scroller.kind === 'element' ? scroller.el.scrollLeft : window.scrollX,
      scrollY: scroller.kind === 'element' ? scroller.el.scrollTop : window.scrollY,
      htmlClass: document.documentElement.className,
      styleEl: true,
    };
    injectStyle();
    document.documentElement.classList.add('pageshot-capturing');
    markRepeatingChrome();
    await Promise.race([
      document.fonts?.ready ?? Promise.resolve(),
      sleep(400),
    ]);
    await frames(2);
    return { ok: true, ...measure() };
  }

  async function warmup() {
    if (!scroller) resolveScroller();
    const start = measure();
    if (start.pageHeight <= start.viewportHeight * 1.1) {
      return { ok: true, ...start };
    }

    let y = 0;
    let lastHeight = start.pageHeight;
    let stable = 0;
    for (let i = 0; i < 80; i += 1) {
      const step = Math.max(1, measure().viewportHeight);
      await scrollToPoint(0, y);
      await settle(700);
      const now = measure();
      if (now.pageHeight <= lastHeight + 2) stable += 1;
      else stable = 0;
      lastHeight = now.pageHeight;
      y += step;
      if (y >= now.pageHeight - 2 && stable >= 1) break;
      if (now.pageHeight >= 20000) break;
    }
    await scrollToPoint(0, 0);
    await settle(700);
    return { ok: true, ...measure() };
  }

  async function restore(scrollBack = true) {
    unmarkRepeatingChrome();
    document.documentElement.classList.remove('pageshot-capturing', 'pageshot-hide-repeat');
    document.getElementById(STYLE_ID)?.remove();
    if (scrollBack && snapshot) {
      await scrollToPoint(snapshot.scrollX, snapshot.scrollY);
    }
    snapshot = null;
    disconnectKeepAlive();
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      try {
        switch (message?.type) {
          case 'prepare':
            sendResponse(await prepare());
            break;
          case 'warmup':
            sendResponse(await warmup());
            break;
          case 'measure':
            sendResponse({ ok: true, ...measure() });
            break;
          case 'scroll':
            await scrollToPoint(message.x, message.y);
            await settle(1100);
            sendResponse({ ok: true, ...measure() });
            break;
          case 'hideRepeats':
            unmarkRepeatingChrome();
            markRepeatingChrome();
            document.documentElement.classList.add('pageshot-hide-repeat');
            await frames(2);
            sendResponse({ ok: true });
            break;
          case 'restore':
            sendResponse(await restore(true));
            break;
          default:
            sendResponse({ ok: false, error: 'unknown' });
        }
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return true;
  });
})();
