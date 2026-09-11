# Ritmexa

**Your moments, on beat.**

Ritmexa is a mobile-first PWA that turns photos and short video clips into beat-synced vertical edits. Version 0.1 runs the core workflow locally in the browser: media selection, audio decoding, beat analysis, preview and real-time export.

## v0.1 features

- Greek and English UI from day one
- Installable PWA with offline app shell
- Local photo and video selection
- Local audio beat analysis using the Web Audio API
- Automatic cut timing from detected beats
- Punch, Flow and Clean motion styles
- 15, 30, 45 and 60 second edit lengths
- 720p and 1080p 9:16 exports
- Browser-native MP4 when supported, WebM fallback where appropriate
- No account, no media upload and no watermark
- Responsive mobile-first Ritmexa coral brand system
- GitHub Pages deployment workflow

## Development

```bash
npm install
npm run dev
```

Production check:

```bash
npm run check
npm run build
```

## Browser notes

Ritmexa uses modern browser media APIs. Export requires `MediaRecorder` and `canvas.captureStream()`. Current Chrome, Edge and Safari are the primary targets. Browser-native output format depends on codec support.

For best mobile performance, 720p is the default. 1080p is available for capable devices.

## Privacy

Selected editing media is processed locally in the browser in v0.1. See `public/privacy.html` for the included privacy summary.

## GitHub Pages

A workflow is included at `.github/workflows/deploy-pages.yml`. In the repository settings, set **Pages → Source → GitHub Actions** once, then pushes to `main` will build and deploy automatically.

## Brand

- Coral: `#FF6B5B`
- Peach: `#FFD6CC`
- Off White: `#FAF9F7`
- Charcoal: `#1F1F1F`
- Warm Gray: `#9CA3A0`

Ritmexa v0.1.0
