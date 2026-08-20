# Zen Page Shot

Capture an entire web page on this device. One toolbar click opens a dedicated results tab, then you can download PNG, JPG, or PDF, or copy the PNG. No account, no upload, no analytics.

## Load unpacked in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select this folder — the one that contains `manifest.json`.
5. Pin Zen Page Shot from the puzzle-piece menu if you want it on the toolbar.

## Use it

Open a normal website and click the Zen Page Shot icon. Chrome cannot screenshot its own pages (`chrome://…`) or the Chrome Web Store.

After the capture, a new tab opens with the full-page image:

- **Download PNG** — the primary action; also `Enter` or `D`
- **JPG** — same capture at quality 0.92; also `J`
- **PDF** — local full-page PDF; also `P`
- **Copy** — PNG on the clipboard; also `C`

The file never leaves your machine. The last capture is kept only so the results tab can show it.

## PDF

Export builds a PDF 1.4 file in this tab. It prefers **one tall page**, sized at 96 dpi so a long capture still looks like one sheet.

Chrome and Acrobat reject pages larger than 14,400 points (200 inches). If a capture would exceed that even after raising the PDF dpi, Zen Page Shot splits the image into sequential pages instead. The stitch step already caps the bitmap, so ordinary pages stay on a single sheet.

## What it does

Zen Page Shot scrolls the page, captures each viewport with Chrome’s `captureVisibleTab`, and stitches the tiles into one image. Sticky and fixed chrome is hidden after the first tile so headers do not repeat. Lazy images are given a moment to load. Very tall pages are scaled to stay inside Chrome’s canvas limits.

## Limits

- Privileged URLs (`chrome://`, Web Store, extension pages) cannot be captured.
- Cross-origin iframes can be photographed only as they appear; Zen Page Shot cannot scroll inside them.
- Infinite-scroll feeds are captured up to a safety cap, not forever.
- `file://` pages need “Allow access to file URLs” on the extension’s card at `chrome://extensions`.
