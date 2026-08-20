# PageShot

Capture an entire web page as a PNG, on this device. One toolbar click, a local preview, then download or copy. No account, no upload, no analytics.

## Load unpacked in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select this folder — the one that contains `manifest.json`.
5. Pin PageShot from the puzzle-piece menu if you want it on the toolbar.

## Use it

Open a normal website and click the PageShot icon. Chrome cannot screenshot its own pages (`chrome://…`) or the Chrome Web Store.

After the capture, a dark preview tab opens with the full-page PNG:

- **Download PNG** — the primary action; also `Enter` or `D`
- **Copy** — puts the image on the clipboard; also `C`

The file never leaves your machine. The last capture is kept only so the preview tab can show it.

## What it does

PageShot scrolls the page, captures each viewport with Chrome’s `captureVisibleTab`, and stitches the tiles into one PNG. Sticky and fixed chrome is hidden after the first tile so headers do not repeat. Lazy images are given a moment to load. Very tall pages are scaled to stay inside Chrome’s canvas limits.

## Limits

- Privileged URLs (`chrome://`, Web Store, extension pages) cannot be captured.
- Cross-origin iframes can be photographed only as they appear; PageShot cannot scroll inside them.
- Infinite-scroll feeds are captured up to a safety cap, not forever.
- `file://` pages need “Allow access to file URLs” on the extension’s card at `chrome://extensions`.
