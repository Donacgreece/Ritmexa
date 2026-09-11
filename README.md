<div align="center">

# Ritmexa

### Your moments, on beat.

A local first Progressive Web App for creating beat synced vertical edits from photos, clips and your own soundtrack.

**Live app:** https://donacgreece.github.io/Ritmexa/

</div>

## Ritmexa 0.2

Ritmexa 0.2 is a major upgrade focused on responsive layout, stronger audio analysis, a cleaner mobile app experience and more expressive editing controls.

### Highlights

- Fully responsive interface for phones, tablets, laptops and desktop monitors
- Desktop preview constrained to the available viewport so it does not overlap other content
- Mobile interface that opens directly into the editing experience
- Installable PWA with offline app shell
- Apple startup images plus an in app launch screen
- Greek and English UI
- iPhone friendly native file pickers
- Music file input
- Soundtrack extraction from a saved video file
- Advanced local rhythm analysis
- BPM estimation
- Beat strength analysis
- Strong beat detection
- Tempo stability score
- Energy analysis
- Waveform visualization
- Adjustable beat sensitivity
- Custom edit duration
- Custom soundtrack start point
- Smart, Every Beat and Strong Beats cut modes
- Adjustable motion intensity
- Eight editing styles
- 720p and 1080p vertical export
- Local browser processing
- No account
- No watermark

## Soundtrack sources

Ritmexa supports two soundtrack workflows.

### Music file

Choose a local MP3, M4A, WAV, AAC, FLAC or another format supported by the browser.

### Soundtrack from a saved video

Choose a saved TikTok, Reel, Short or another local video file. Ritmexa attempts to prepare the embedded audio locally on the device and then runs beat analysis on that soundtrack.

Direct importing from a TikTok URL is not included in this release. The user supplies a saved video file from their device.

## Motion styles

- Punch
- Flow
- Clean
- Flash
- Drift
- Film
- Zoom
- Glitch

## Privacy

The current editing workflow is designed to run locally in the browser. Selected photos, clips and soundtrack media are not uploaded to a Ritmexa media processing server.

The website itself is hosted on GitHub Pages, so normal hosting request logs can still apply.

## Development

Requirements:

- Node.js 22 or newer
- npm

Install dependencies:

```bash
npm install
```

Run development mode:

```bash
npm run dev
```

Type check:

```bash
npm run check
```

Create a production build:

```bash
npm run build
```

Preview the build:

```bash
npm run preview
```

## Deployment

Every successful push to `main` triggers the GitHub Pages workflow.

Live address:

```text
https://donacgreece.github.io/Ritmexa/
```

Repository:

```text
https://github.com/Donacgreece/Ritmexa
```

## Browser targets

Primary targets are current versions of:

- Safari
- Chrome
- Edge

On phones, 720p is recommended for faster and more reliable local rendering. Browser codec support determines whether the final file is MP4 or WebM.

## Brand

| Token | Value |
| --- | --- |
| Coral | `#FF6B5B` |
| Peach | `#FFD6CC` |
| Off White | `#FAF9F7` |
| Charcoal | `#1F1F1F` |
| Warm Gray | `#858B88` |

**Ritmexa 0.2.0**


### Build reliability

Version 0.2.2 invokes Vite and TypeScript through Node directly and normalizes executable permissions in GitHub Actions. This avoids cross platform executable bit issues during Pages builds.


## 0.2.3 preview workspace

The preview was redesigned to stay compact at every viewport size. Desktop and laptop layouts no longer use an internal preview scrollbar, while phones use a compact horizontal preview card so the 9:16 canvas does not take over half of the screen. Export controls now live in the main editing column.

## Preview sizing

Version 0.2.4 slightly increases the preview size on desktop, tablet and phone while keeping the compact no-scroll workspace introduced in 0.2.3.
