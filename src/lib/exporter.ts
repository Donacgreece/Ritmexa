import { selectEditBeats, strengthAtBeat } from './beat'
import type {
  BeatAnalysis,
  ColorLook,
  CropMode,
  CutMode,
  EditStyle,
  ExportResult,
  MediaItem,
  MediaOrder,
  OutputQuality,
  TransitionStyle
} from '../types'

interface ExportOptions {
  media: MediaItem[]
  audioFile: File
  analysis: BeatAnalysis
  seconds: number
  startAt: number
  style: EditStyle
  fxPool?: EditStyle[]
  transition: TransitionStyle
  colorLook: ColorLook
  quality: OutputQuality
  cutMode: CutMode
  customInterval: number
  mediaOrder: MediaOrder
  cropMode: CropMode
  videoSpeed: number
  beatAccents: boolean
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

function lookFilter(look: ColorLook, blur = 0) {
  const filters: Record<ColorLook, string> = {
    natural: 'saturate(1) contrast(1)',
    vivid: 'saturate(1.28) contrast(1.08)',
    warm: 'saturate(1.08) sepia(.13) contrast(1.03)',
    cool: 'saturate(1.05) hue-rotate(8deg) contrast(1.04)',
    mono: 'grayscale(1) contrast(1.1)',
    contrast: 'saturate(1.08) contrast(1.2) brightness(.98)'
  }
  return `${filters[look]}${blur > 0 ? ` blur(${blur.toFixed(1)}px)` : ''}`
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
  alpha = 1,
  filter = 'none'
) {
  const dimensions = sourceDimensions(source, width, height)
  if (!dimensions.width || !dimensions.height) return

  const baseScale = Math.max(width / dimensions.width, height / dimensions.height) * scale
  const drawW = dimensions.width * baseScale
  const drawH = dimensions.height * baseScale

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.filter = filter
  ctx.translate(width / 2, height / 2)
  ctx.rotate(rotation)
  ctx.translate(-width / 2, -height / 2)
  const x = (width - drawW) / 2 + panX
  const y = (height - drawH) / 2 + panY
  ctx.drawImage(source, x, y, drawW, drawH)
  ctx.restore()
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  scale = 1,
  panX = 0,
  panY = 0,
  rotation = 0,
  alpha = 1,
  filter = 'none'
) {
  const dimensions = sourceDimensions(source, width, height)
  if (!dimensions.width || !dimensions.height) return

  const baseScale = Math.min(width / dimensions.width, height / dimensions.height) * scale
  const drawW = dimensions.width * baseScale
  const drawH = dimensions.height * baseScale

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.filter = filter
  ctx.translate(width / 2, height / 2)
  ctx.rotate(rotation)
  ctx.translate(-width / 2, -height / 2)
  const x = (width - drawW) / 2 + panX
  const y = (height - drawH) / 2 + panY
  ctx.drawImage(source, x, y, drawW, drawH)
  ctx.restore()
}

function drawMedia(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  cropMode: CropMode,
  colorLook: ColorLook,
  transform: { scale: number; panX: number; panY: number; rotation: number },
  alpha = 1,
  blur = 0
) {
  if (cropMode === 'contain') {
    drawCover(ctx, source, width, height, 1.08, 0, 0, 0, alpha * 0.5, `${lookFilter(colorLook, 26)} brightness(.55)`)
    drawContain(ctx, source, width, height, transform.scale, transform.panX, transform.panY, transform.rotation, alpha, lookFilter(colorLook, blur))
    return
  }
  drawCover(ctx, source, width, height, transform.scale, transform.panX, transform.panY, transform.rotation, alpha, lookFilter(colorLook, blur))
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

  if (style === 'clean') scale = 1.012 + progress * 0.018 * amount

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

  if (style === 'shake') {
    const hit = Math.exp(-progress * 8)
    scale = 1.035 + hit * 0.025 * amount
    panX = Math.sin(progress * 42 + sceneIndex) * width * 0.018 * hit * amount
    panY = Math.cos(progress * 37 + sceneIndex) * height * 0.012 * hit * amount
    rotation = Math.sin(progress * 29) * 0.018 * hit * amount
  }

  if (style === 'whip') {
    const direction = sceneIndex % 2 === 0 ? -1 : 1
    const enter = (1 - ease(Math.min(1, progress / 0.22)))
    scale = 1.04 + enter * 0.025 * amount
    panX = direction * width * 0.24 * enter * amount
    rotation = direction * 0.035 * enter * amount
  }

  if (style === 'pulse') {
    const pulse = Math.sin(progress * Math.PI * 2) * 0.5 + 0.5
    scale = 1.02 + pulse * (0.025 + strength * 0.035) * amount
  }

  if (style === 'bounce') {
    const bounce = Math.sin(Math.min(1, progress * 1.3) * Math.PI)
    scale = 1.035 + bounce * 0.025 * amount
    panY = -bounce * height * 0.035 * amount
  }

  if (style === 'spin') {
    const direction = sceneIndex % 2 === 0 ? -1 : 1
    const settle = 1 - ease(Math.min(1, progress / 0.38))
    scale = 1.055 + settle * 0.035 * amount
    rotation = direction * settle * 0.095 * amount
  }

  if (style === 'blur') {
    scale = 1.045 + progress * 0.035 * amount
  }

  if (style === 'chroma') {
    const hit = Math.exp(-progress * 10)
    scale = 1.035 + hit * 0.035 * amount
    panX = Math.sin(sceneIndex * 2.1) * width * 0.006 * amount
  }

  if (style === 'dream') {
    const direction = sceneIndex % 2 === 0 ? -1 : 1
    scale = 1.06 + progress * 0.045 * amount
    panX = direction * width * 0.022 * (progress - 0.5) * amount
    panY = -height * 0.014 * Math.sin(progress * Math.PI) * amount
  }

  return { scale, panX, panY, rotation }
}

function resolveTransition(transition: TransitionStyle, style: EditStyle): Exclude<TransitionStyle, 'auto'> {
  if (transition !== 'auto') return transition
  if (['flow', 'clean', 'drift', 'film', 'dream'].includes(style)) return 'crossfade'
  if (['flash', 'punch', 'pulse'].includes(style)) return 'flash'
  if (['whip', 'shake', 'spin'].includes(style)) return 'whip'
  if (['glitch', 'chroma'].includes(style)) return 'glitch'
  if (style === 'blur') return 'blur'
  return 'cut'
}

function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number, opacity = 0.18) {
  const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.28, width / 2, height / 2, Math.max(width, height) * 0.72)
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, `rgba(0,0,0,${opacity})`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

function drawFilmGrain(ctx: CanvasRenderingContext2D, width: number, height: number, frameSeed: number) {
  const count = 46
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
  transition: TransitionStyle,
  colorLook: ColorLook,
  cropMode: CropMode,
  sceneIndex: number,
  progress: number,
  strength: number,
  intensity: number,
  beatAccents: boolean,
  frameSeed: number
) {
  ctx.globalAlpha = 1
  ctx.filter = 'none'
  ctx.fillStyle = '#0d1114'
  ctx.fillRect(0, 0, width, height)

  const transform = styleTransform(style, sceneIndex, progress, strength, intensity, width, height)
  const activeTransition = resolveTransition(transition, style)
  const transitionWindow = activeTransition === 'crossfade' ? 0.2 : activeTransition === 'blur' ? 0.18 : 0.12
  const transitionProgress = clamp(progress / transitionWindow)
  const mix = ['crossfade', 'blur'].includes(activeTransition) && previous ? ease(transitionProgress) : 1

  if (previous && mix < 1) {
    const prevTransform = styleTransform(style, sceneIndex - 1, 1, strength, intensity, width, height)
    drawMedia(ctx, previous.source, width, height, cropMode, colorLook, prevTransform, 1)
  }

  let currentTransform = transform
  let blurAmount = style === 'blur' ? Math.max(0, (1 - Math.min(1, progress / 0.28)) * 13 * intensity) : 0

  if (activeTransition === 'whip' && previous && progress < transitionWindow) {
    const direction = sceneIndex % 2 === 0 ? 1 : -1
    const enter = 1 - ease(transitionProgress)
    const prevTransform = { ...transform, panX: -direction * width * 0.5 * (1 - enter), scale: 1.04 }
    drawMedia(ctx, previous.source, width, height, cropMode, colorLook, prevTransform, 1)
    currentTransform = { ...transform, panX: transform.panX + direction * width * 0.56 * enter }
  }

  if (activeTransition === 'blur') blurAmount += (1 - transitionProgress) * 18 * intensity

  drawMedia(ctx, current.source, width, height, cropMode, colorLook, currentTransform, mix, blurAmount)

  if (style === 'chroma' && progress < 0.16) {
    const fade = 1 - progress / 0.16
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    drawMedia(ctx, current.source, width, height, cropMode, colorLook, { ...transform, panX: transform.panX - width * 0.012 * fade }, 0.12 * fade, 0)
    ctx.fillStyle = `rgba(255,45,58,${0.06 * fade})`
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }

  if (style === 'film') {
    ctx.fillStyle = 'rgba(255,126,91,.045)'
    ctx.fillRect(0, 0, width, height)
    drawVignette(ctx, width, height, 0.24)
    drawFilmGrain(ctx, width, height, frameSeed)
  }

  if (style === 'clean') drawVignette(ctx, width, height, 0.1)

  if (style === 'dream') {
    const gradient = ctx.createLinearGradient(0, 0, width, height)
    gradient.addColorStop(0, 'rgba(219,246,255,.10)')
    gradient.addColorStop(1, 'rgba(255,255,255,.045)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  }

  const flashActive = activeTransition === 'flash' || style === 'flash'
  if (flashActive && progress < 0.095) {
    const alpha = (1 - progress / 0.095) * 0.46 * clamp(intensity) * (0.45 + strength)
    ctx.fillStyle = `rgba(255,255,255,${alpha})`
    ctx.fillRect(0, 0, width, height)
  }

  const glitchActive = activeTransition === 'glitch' || style === 'glitch' || style === 'chroma'
  if (glitchActive && progress < 0.1 && strength > 0.35) {
    const fade = 1 - progress / 0.1
    const alpha = 0.17 * clamp(intensity) * fade
    ctx.fillStyle = `rgba(255,45,58,${alpha})`
    ctx.fillRect(0, height * 0.27, width, height * 0.045)
    ctx.fillStyle = `rgba(70,216,255,${alpha})`
    ctx.fillRect(0, height * 0.63, width, height * 0.032)
    ctx.fillStyle = `rgba(255,255,255,${alpha * 0.55})`
    ctx.fillRect(0, height * 0.47, width, height * 0.012)
  }

  if (beatAccents && progress < 0.075 && strength > 0.62) {
    const alpha = (1 - progress / 0.075) * 0.12 * intensity
    ctx.fillStyle = `rgba(255,45,58,${alpha})`
    ctx.fillRect(0, 0, width, height)
  }
}

function buildMediaSequence(length: number, order: MediaOrder) {
  const sequence = Array.from({ length }, (_, index) => index)
  if (order === 'sequence' || length <= 2) return sequence
  let seed = length * 97 + 31
  for (let i = sequence.length - 1; i > 0; i -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const j = seed % (i + 1)
    ;[sequence[i], sequence[j]] = [sequence[j], sequence[i]]
  }
  return sequence
}

export function canExportLocally() {
  return Boolean(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream)
}

export async function exportVideo(options: ExportOptions): Promise<ExportResult> {
  if (!canExportLocally()) throw new Error('unsupported')

  const {
    media,
    audioFile,
    analysis,
    seconds,
    startAt,
    style,
    fxPool = [style],
    transition,
    colorLook,
    quality,
    cutMode,
    customInterval,
    mediaOrder,
    cropMode,
    videoSpeed,
    beatAccents,
    intensity,
    onProgress
  } = options

  const width = quality === '1080' ? 1080 : 720
  const height = quality === '1080' ? 1920 : 1280
  const safeStart = Math.max(0, Math.min(startAt, Math.max(0, analysis.duration - 0.2)))
  const duration = Math.min(Math.max(3, seconds), Math.max(0.2, analysis.duration - safeStart), 180)
  const editBeats = selectEditBeats(analysis, cutMode, safeStart, duration, customInterval)
  const prepared = await loadPrepared(media)
  const mediaSequence = buildMediaSequence(prepared.length, mediaOrder)
  const effects = fxPool.length ? fxPool : [style]

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
    const mediaIndex = mediaSequence[scene.index % mediaSequence.length]
    const previousSceneIndex = scene.index > 0 ? scene.index - 1 : Math.max(0, mediaSequence.length - 1)
    const previousIndex = mediaSequence[previousSceneIndex % mediaSequence.length]
    const current = prepared[mediaIndex]
    const previous = prepared[previousIndex]
    const activeStyle = effects[scene.index % effects.length] ?? style

    if (scene.index !== currentScene) {
      previousVideo = activeVideo
      currentScene = scene.index
      activeVideo = current.video
      if (activeVideo) {
        activeVideo.playbackRate = Math.min(2, Math.max(0.5, videoSpeed))
        try { activeVideo.currentTime = 0 } catch { /* ignore */ }
        void activeVideo.play().catch(() => undefined)
      }
      if (previousVideo && previousVideo !== activeVideo && resolveTransition(transition, activeStyle) === 'cut') previousVideo.pause()
    }

    renderFrame(
      ctx,
      current,
      previous,
      width,
      height,
      activeStyle,
      transition,
      colorLook,
      cropMode,
      scene.index,
      scene.progress,
      scene.strength,
      intensity,
      beatAccents,
      frameSeed++
    )

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
