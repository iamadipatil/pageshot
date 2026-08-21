# Zen Page Shot

<img src="icons/icon48.png" alt="Zen Page Shot" width="48" height="48">

Zen Page Shot is a Chrome extension that captures an entire web page on your device. One toolbar click opens a results tab — download PNG, JPG, or PDF, or copy the image. Nothing is uploaded. No account, no telemetry.

## Install (unpacked)

Get the source, then load it in Chrome.

**Clone**

```bash
git clone https://github.com/iamadipatil/pageshot.git
```

**Or download a ZIP**

1. On this repo, click **Code → Download ZIP**.
2. Unzip the archive.

Then load the folder in Chrome (Chrome 109+):

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the folder that contains `manifest.json` (the cloned repo, or the unzipped folder).
5. Pin Zen Page Shot from the puzzle-piece menu so the icon stays on the toolbar.

## Use it

Open a normal website — not `chrome://` or the Chrome Web Store — and click the Zen Page Shot icon. A new tab opens with the full-page capture.

- **Download PNG** — also `Enter` or `D`
- **JPG** — also `J`
- **PDF** — also `P`
- **Copy** — PNG on the clipboard; also `C`

The file never leaves your machine.

## Limits

- Privileged URLs (`chrome://`, Chrome Web Store, extension pages) cannot be captured.
- Cross-origin iframes are captured only as they appear; Zen Page Shot cannot scroll inside them.
- Infinite-scroll feeds are captured up to a safety cap, not forever.
- `file://` pages need **Allow access to file URLs** on the extension’s card at `chrome://extensions`.

## License

[MIT](LICENSE) © 2026 Aditya Patil
