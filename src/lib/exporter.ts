import { selectEditBeats, strengthAtBeat } from './beat'
import type { BeatAnalysis, CutMode, EditStyle, ExportResult, MediaItem, OutputQuality } from '../types'

interface ExportOptions {
  media: MediaItem[]
  audioFile: File
  analysis: BeatAnalysis
  seconds: number
  startAt: number
  style: EditStyle
  quality: OutputQuality
  cutMode: CutMode
  intensity: number
  onProgress?: (progress: number) => void
}

interface PreparedItem {
  source: CanvasImageSource
  kind: 'image' | 'video'
  video?: HTMLVideoElement
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const ease = (value: number) => value * value * (3 - 2 * value)

function pickMimeType() {
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

async function loadPrepared(items: MediaItem[]): Promise<PreparedItem[]> {
  return Promise.all(items.map(async (item) => {
    if (item.kind === 'image') {
      try {
        if ('createImageBitmap' in window) {
          const bitmap = await createImageBitmap(item.file)
          return { source: bitmap, kind: 'image' as const }
        }
      } catch {
        // Safari can display some formats that createImageBitmap cannot decode.
      }

      const image = new Image()
      image.src = item.url
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error(`Could not load ${item.name}`))
      })
      return { source: image, kind: 'image' as const }
    }

    const video = document.createElement('video')
    video.src = item.url
    video.muted = true
    video.loop = true
    video.playsInline = true
    video.preload = 'auto'
    video.setAttribute('playsinline', '')
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error(`Could not load ${item.name}`))
    })
    return { source: video, video, kind: 'video' as const }
  }))
}

function sourceDimensions(source: CanvasImageSource, fallbackWidth: number, fallbackHeight: number) {
  if (source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight }
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth, height: source.naturalHeight }
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) return { width: source.width, height: source.height }
  return { width: fallbackWidth, height: fallbackHeight }
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  scale = 1,
  panX = 0,
  panY = 0,
  rotation = 0,
  alpha = 1
) {
  const dimensions = sourceDimensions(source, width, height)
  if (!dimensions.width || !dimensions.height) return

  const baseScale = Math.max(width / dimensions.width, height / dimensions.height) * scale
  const drawW = dimensions.width * baseScale
  const drawH = dimensions.height * baseScale

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(width / 2, height / 2)
  ctx.rotate(rotation)
  ctx.translate(-width / 2, -height / 2)
  const x = (width - drawW) / 2 + panX
  const y = (height - drawH) / 2 + panY
  ctx.drawImage(source, x, y, drawW, drawH)
  ctx.restore()
}

function sceneForTime(time: number, beats: number[], analysis: BeatAnalysis) {
  let index = 0
  for (let i = 0; i < beats.length; i += 1) {
    if (beats[i] <= time) index = i
    else break
  }
  const start = beats[index] ?? beats[0] ?? 0
  const end = beats[index + 1] ?? start + Math.max(0.35, 60 / analysis.bpm)
  const progress = clamp((time - start) / Math.max(0.08, end - start))
  return { index, start, end, progress, strength: strengthAtBeat(analysis, start) }
}

function styleTransform(
  style: EditStyle,
  sceneIndex: number,
  progress: number,
  strength: number,
  intensity: number,
  width: number,
  height: number
) {
  const amount = clamp(intensity, 0.15, 1.25)
  let scale = 1.018
  let panX = 0
  let panY = 0
  let rotation = 0

  if (style === 'punch') {
    const hit = Math.exp(-progress * 8.5)
    scale = 1.025 + hit * (0.035 + strength * 0.07) * amount
  }

  if (style === 'flow') {
    scale = 1.045 + progress * 0.05 * amount
    const direction = sceneIndex % 2 === 0 ? -1 : 1
    panX = direction * width * 0.032 * (progress - 0.5) * amount
    panY = height * 0.012 * Math.sin(progress * Math.PI) * amount
  }

  if (style === 'clean') {
    scale = 1.012 + progress * 0.018 * amount
  }

  if (style === 'flash') {
    const hit = Math.exp(-progress * 11)
    scale = 1.02 + hit * 0.105 * amount * (0.55 + strength)
    rotation = (sceneIndex % 2 === 0 ? -1 : 1) * hit * 0.008 * amount
  }

  if (style === 'drift') {
    const direction = sceneIndex % 2 === 0 ? -1 : 1
    scale = 1.06 + 0.025 * Math.sin(progress * Math.PI) * amount
    panX = direction * width * 0.045 * (progress - 0.5) * amount
    panY = -height * 0.025 * (progress - 0.5) * amount
    rotation = direction * (progress - 0.5) * 0.025 * amount
  }

  if (style === 'film') {
    scale = 1.045 + 0.02 * progress * amount
    panX = Math.sin(sceneIndex * 1.7 + progress * 3) * width * 0.006 * amount
    panY = Math.cos(sceneIndex * 1.3 + progress * 2) * height * 0.004 * amount
    rotation = Math.sin(sceneIndex * 0.9) * 0.004 * amount
  }

  if (style === 'zoom') {
    const reverse = sceneIndex % 2 === 1
    const zoom = reverse ? 1 - progress : progress
    scale = 1.02 + 0.14 * zoom * amount
    panY = (sceneIndex % 3 - 1) * height * 0.01 * (progress - 0.5) * amount
  }

  if (style === 'glitch') {
    const hit = Math.exp(-progress * 14)
    scale = 1.025 + hit * 0.035 * amount
    panX = (sceneIndex % 2 === 0 ? -1 : 1) * hit * width * 0.018 * amount
  }

  return { scale, panX, panY, rotation }
}

function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number, opacity = 0.18) {
  const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.28, width / 2, height / 2, Math.max(width, height) * 0.72)
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, `rgba(0,0,0,${opacity})`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

function drawFilmGrain(ctx: CanvasRenderingContext2D, width: number, height: number, frameSeed: number) {
  const count = 42
  let seed = (frameSeed * 9301 + 49297) % 233280
  for (let i = 0; i < count; i += 1) {
    seed = (seed * 9301 + 49297) % 233280
    const x = (seed / 233280) * width
    seed = (seed * 9301 + 49297) % 233280
    const y = (seed / 233280) * height
    const size = 1 + ((seed % 3) * 0.7)
    ctx.fillStyle = i % 3 === 0 ? 'rgba(255,245,232,.055)' : 'rgba(20,16,14,.045)'
    ctx.fillRect(x, y, size, size)
  }
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  current: PreparedItem,
  previous: PreparedItem | undefined,
  width: number,
  height: number,
  style: EditStyle,
  sceneIndex: number,
  progress: number,
  strength: number,
  intensity: number,
  frameSeed: number
) {
  ctx.globalAlpha = 1
  ctx.fillStyle = '#11110f'
  ctx.fillRect(0, 0, width, height)

  const transform = styleTransform(style, sceneIndex, progress, strength, intensity, width, height)
  const crossfadeStyles: EditStyle[] = ['flow', 'clean', 'drift', 'film']
  const fadeWindow = style === 'clean' ? 0.2 : 0.14
  const mix = crossfadeStyles.includes(style) && previous ? ease(clamp(progress / fadeWindow)) : 1

  if (previous && mix < 1) {
    const prevTransform = styleTransform(style, sceneIndex - 1, 1, strength, intensity, width, height)
    drawCover(ctx, previous.source, width, height, prevTransform.scale, prevTransform.panX, prevTransform.panY, prevTransform.rotation, 1)
  }

  drawCover(ctx, current.source, width, height, transform.scale, transform.panX, transform.panY, transform.rotation, mix)

  if (style === 'punch' && progress < 0.11) {
    const alpha = (1 - progress / 0.11) * 0.16 * clamp(intensity) * (0.5 + strength)
    ctx.fillStyle = `rgba(255,45,58,${alpha})`
    ctx.fillRect(0, 0, width, height)
  }

  if (style === 'flash' && progress < 0.085) {
    const alpha = (1 - progress / 0.085) * 0.48 * clamp(intensity) * (0.45 + strength)
    ctx.fillStyle = `rgba(255,245,238,${alpha})`
    ctx.fillRect(0, 0, width, height)
  }

  if (style === 'clean') drawVignette(ctx, width, height, 0.1)

  if (style === 'film') {
    ctx.fillStyle = 'rgba(255,126,91,.055)'
    ctx.fillRect(0, 0, width, height)
    drawVignette(ctx, width, height, 0.24)
    drawFilmGrain(ctx, width, height, frameSeed)
  }

  if (style === 'glitch' && progress < 0.09 && strength > 0.42) {
    const fade = 1 - progress / 0.09
    const alpha = 0.14 * clamp(intensity) * fade

    ctx.fillStyle = `rgba(255,42,91,${alpha})`
    ctx.fillRect(0, height * 0.27, width, height * 0.045)

    ctx.fillStyle = `rgba(38,220,224,${alpha})`
    ctx.fillRect(0, height * 0.63, width, height * 0.032)

    ctx.fillStyle = `rgba(255,255,255,${alpha * 0.6})`
    ctx.fillRect(0, height * 0.47, width, height * 0.012)
  }

}

export function canExportLocally() {
  return Boolean(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream)
}

export async function exportVideo(options: ExportOptions): Promise<ExportResult> {
  if (!canExportLocally()) throw new Error('unsupported')

  const { media, audioFile, analysis, seconds, startAt, style, quality, cutMode, intensity, onProgress } = options
  const width = quality === '1080' ? 1080 : 720
  const height = quality === '1080' ? 1920 : 1280
  const safeStart = Math.max(0, Math.min(startAt, Math.max(0, analysis.duration - 0.2)))
  const duration = Math.min(Math.max(3, seconds), Math.max(0.2, analysis.duration - safeStart), 180)
  const editBeats = selectEditBeats(analysis, cutMode, safeStart, duration)
  const prepared = await loadPrepared(media)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('canvas-unavailable')

  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) throw new Error('web-audio-unavailable')

  const audioContext = new AudioContextCtor()
  const audioBuffer = await audioContext.decodeAudioData((await audioFile.arrayBuffer()).slice(0))
  const audioSource = audioContext.createBufferSource()
  audioSource.buffer = audioBuffer
  const destination = audioContext.createMediaStreamDestination()
  audioSource.connect(destination)

  const canvasStream = canvas.captureStream(30)
  const outputStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...destination.stream.getAudioTracks()
  ])

  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(
    outputStream,
    mimeType ? {
      mimeType,
      videoBitsPerSecond: quality === '1080' ? 11_000_000 : 6_500_000,
      audioBitsPerSecond: 192_000
    } : undefined
  )

  const chunks: BlobPart[] = []
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data)

  let currentScene = -1
  let activeVideo: HTMLVideoElement | undefined
  let previousVideo: HTMLVideoElement | undefined
  let frameId = 0
  let finished = false
  let renderStart = 0
  let frameSeed = 0

  const stopAllVideos = () => prepared.forEach((item) => item.video?.pause())

  const render = () => {
    if (finished) return
    const elapsed = clamp(audioContext.currentTime - renderStart, 0, duration)
    const absoluteTime = safeStart + elapsed
    const scene = sceneForTime(absoluteTime, editBeats, analysis)
    const mediaIndex = scene.index % prepared.length
    const previousIndex = scene.index > 0 ? (scene.index - 1) % prepared.length : prepared.length - 1
    const current = prepared[mediaIndex]
    const previous = prepared[previousIndex]

    if (scene.index !== currentScene) {
      previousVideo = activeVideo
      currentScene = scene.index
      activeVideo = current.video
      if (activeVideo) {
        try { activeVideo.currentTime = 0 } catch { /* ignore */ }
        void activeVideo.play().catch(() => undefined)
      }
      if (previousVideo && previousVideo !== activeVideo && !['flow', 'clean', 'drift', 'film'].includes(style)) previousVideo.pause()
    }

    renderFrame(ctx, current, previous, width, height, style, scene.index, scene.progress, scene.strength, intensity, frameSeed++)
    onProgress?.(clamp(elapsed / duration))
    if (elapsed < duration) frameId = requestAnimationFrame(render)
  }

  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
  recorder.start(500)
  await audioContext.resume()
  renderStart = audioContext.currentTime + 0.08
  audioSource.start(renderStart, safeStart, duration)
  frameId = requestAnimationFrame(render)

  while (audioContext.currentTime - renderStart < duration) await wait(100)

  finished = true
  cancelAnimationFrame(frameId)
  stopAllVideos()
  try { audioSource.stop() } catch { /* already ended */ }
  if (recorder.state !== 'inactive') recorder.stop()
  await stopped
  outputStream.getTracks().forEach((track) => track.stop())
  await audioContext.close()

  const finalMime = recorder.mimeType || mimeType || 'video/webm'
  const blob = new Blob(chunks, { type: finalMime })
  const extension = finalMime.includes('mp4') ? 'mp4' : 'webm'
  const url = URL.createObjectURL(blob)
  return { blob, url, filename: `ritmexa-${Date.now()}.${extension}`, mimeType: finalMime }
}
