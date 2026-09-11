<div align="center">

# Ritmexa

### Your moments, on beat.

**A privacy-first, mobile-first PWA for turning photos and short video clips into beat-synced vertical edits.**

[Live App](https://donacgreece.github.io/Ritmexa/) · [Repository](https://github.com/Donacgreece/Ritmexa)

</div>

---

## What is Ritmexa?

Ritmexa is a browser-based creator tool for making short, rhythm-driven videos from your own photos, clips and music.

The core editing workflow runs locally in the browser. Your selected media does not need to be uploaded to a Ritmexa server in the current version.

Built for TikTok, Instagram Reels, YouTube Shorts and other vertical-video workflows.

## Highlights

- Mobile-first interface
- Progressive Web App, installable on supported devices
- Greek and English UI
- Local photo and video selection
- Local audio decoding and beat detection
- Automatic beat-synced cut timing
- Punch, Flow and Clean edit styles
- 15, 30, 45 and 60 second projects
- 9:16 vertical output
- 720p and 1080p export options
- Browser-native video rendering
- MP4 where supported, WebM fallback when required
- No account required
- No watermark
- Privacy-first local processing

## How it works

1. **Add media**  
   Choose photos and short video clips from your device.

2. **Choose a track**  
   Add an audio file directly from your device.

3. **Analyze the beat**  
   Ritmexa analyzes the track locally and estimates beat positions and BPM.

4. **Pick an editing style**  
   Choose Punch, Flow or Clean.

5. **Preview and export**  
   Preview the rhythm-based sequence and render the result directly in your browser.

## Privacy

Ritmexa v0.1 is designed around local browser processing.

Your editing media stays on your device during the core workflow. There is no account requirement and no mandatory media upload.

See the included privacy page for the current privacy summary.

## PWA

Ritmexa is built as a Progressive Web App.

On supported browsers it can be installed to the home screen or desktop and launched in a standalone app window.

The PWA includes:

- installable app manifest
- application icons
- service worker
- offline app shell
- automatic service-worker updates

## Languages

Ritmexa ships with two languages from the first release:

- 🇬🇷 Ελληνικά
- 🇬🇧 English

The selected language is remembered locally in the browser.

## Technology

- React
- TypeScript
- Vite
- Vite PWA
- Web Audio API
- Canvas
- MediaRecorder
- `canvas.captureStream()`
- GitHub Actions
- GitHub Pages

## Local development

Requirements:

- Node.js 22+
- npm

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Type-check:

```bash
npm run check
```

Create a production build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Deployment

Ritmexa is configured to deploy automatically to GitHub Pages whenever a successful commit reaches `main`.

Deployment workflow:

```text
.github/workflows/deploy-pages.yml
```

Live URL:

```text
https://donacgreece.github.io/Ritmexa/
```

GitHub repository:

```text
https://github.com/Donacgreece/Ritmexa
```

## Browser support

Ritmexa relies on modern browser media APIs.

Primary targets:

- Chrome
- Edge
- Safari
- Chromium-based mobile browsers

Actual export container and codec support can vary by browser and operating system.

For mobile devices, 720p is recommended as the default export option. 1080p is available for more capable devices.

## Brand

| Token | Value |
|---|---|
| Coral | `#FF6B5B` |
| Peach | `#FFD6CC` |
| Off White | `#FAF9F7` |
| Charcoal | `#1F1F1F` |
| Warm Gray | `#9CA3A0` |

**Ritmexa**  
*Your moments, on beat.*

---

### Current release

`v0.1.0`

Early product release. The project is actively evolving.
