<div align="center">

# Ritmexa

### Your moments, on beat.

A local first creator PWA for turning photos, clips and music into beat synced vertical edits.

**Live app:** https://donacgreece.github.io/Ritmexa/

</div>

## Ritmexa 0.3 Creator Studio

Version 0.3 moves Ritmexa from a simple beat synced generator toward a reusable creator tool. The editor can now mix multiple motion effects, transitions, color looks and pacing rules so the same media can produce genuinely different edits.

### Creator features

- 16 motion effects
- Multi effect Motion Mix with up to 6 effects in one edit
- Viral, Smooth, Cinematic, Hyper and Minimal creator recipes
- One tap Remix that generates a new combination without replacing the selected media
- 7 transition modes including Auto, Crossfade, Flash, Whip, Blur and Glitch
- 6 color looks
- Smart, Every Beat, Strong Beats and Custom cut timing
- Exact custom cut interval from 0.20 to 4 seconds
- Custom edit start point and duration
- Sequential or shuffled media order
- Fill or Fit framing
- Adjustable source clip playback speed
- Optional strong beat accents
- Adjustable motion intensity
- Save and load a personal creator preset locally on the device
- 720p and 1080p vertical export

### Rhythm engine

- BPM estimation
- Beat detection
- Strong beat detection
- Beat strength analysis
- Tempo stability
- Energy estimate
- Waveform visualization
- Adjustable beat sensitivity

### Soundtrack sources

- Local music files
- Soundtrack extraction from a saved local video file

Direct importing from a TikTok URL is intentionally not included because the current GitHub Pages architecture has no media import backend.

### Mobile and PWA

- Mobile first creator UI
- First studio screen focuses on Preview and Step 1
- Android native PWA install prompt
- iPhone install instructions through Safari Add to Home Screen
- Dedicated iPhone startup images
- Correct Ritmexa splash mark reused from the real app icon geometry
- Offline app shell through the service worker

### Privacy

Selected photos, clips and soundtrack media are processed locally in the browser. Ritmexa does not upload project media to a Ritmexa rendering server in this release.

## Development

Requirements:

- Node.js 22 or newer
- npm

```bash
npm install
npm run check
npm run build
npm run dev
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

## Palette

| Token | Value |
| --- | --- |
| Machine Red | `#FF2D3A` |
| Glacier Blue | `#DBF6FF` |
| Off White | `#F7FCFE` |
| Charcoal | `#1F1F1F` |

**Ritmexa 0.3.0**
