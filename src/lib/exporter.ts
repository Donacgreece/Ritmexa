import type { BeatAnalysis, EditStyle, ExportResult, MediaItem, OutputQuality } from '../types'

interface ExportOptions {
  media: MediaItem[]
  audioFile: File
  analysis: BeatAnalysis
  seconds: number
  style: EditStyle
  quality: OutputQuality
  onProgress?: (progress: number) => void
}

interface PreparedItem {
  source: CanvasImageSource
  kind: 'image' | 'video'
  video?: HTMLVideoElement
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

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
      if ('createImageBitmap' in window) {
        const bitmap = await createImageBitmap(item.file)
        return { source: bitmap, kind: 'image' as const }
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
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error(`Could not load ${item.name}`))
    })
    return { source: video, video, kind: 'video' as const }
  }))
}

function drawCover(ctx: CanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number, scale = 1, panX = 0, panY = 0) {
  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source instanceof HTMLImageElement ? source.naturalWidth : typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap ? source.width : width
  const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source instanceof HTMLImageElement ? source.naturalHeight : typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap ? source.height : height
  if (!sourceWidth || !sourceHeight) return
  const baseScale = Math.max(width / sourceWidth, height / sourceHeight) * scale
  const drawW = sourceWidth * baseScale
  const drawH = sourceHeight * baseScale
  const x = (width - drawW) / 2 + panX
  const y = (height - drawH) / 2 + panY
  ctx.drawImage(source, x, y, drawW, drawH)
}

function sceneForTime(time: number, beats: number[]) {
  let index = 0
  for (let i = 0; i < beats.length; i += 1) {
    if (beats[i] <= time) index = i
    else break
  }
  const start = beats[index] ?? 0
  const end = beats[index + 1] ?? start + 0.5
  return { index, start, end, progress: Math.min(1, Math.max(0, (time - start) / Math.max(0.1, end - start))) }
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  item: PreparedItem,
  width: number,
  height: number,
  style: EditStyle,
  sceneIndex: number,
  progress: number
) {
  ctx.fillStyle = '#11110f'
  ctx.fillRect(0, 0, width, height)

  let scale = 1.02
  let panX = 0
  let panY = 0
  if (style === 'punch') scale = 1.03 + 0.055 * Math.sin(Math.PI * progress)
  if (style === 'flow') {
    scale = 1.05 + 0.035 * progress
    panX = (sceneIndex % 2 === 0 ? -1 : 1) * width * 0.025 * (progress - 0.5)
    panY = height * 0.012 * Math.sin(progress * Math.PI)
  }

  drawCover(ctx, item.source, width, height, scale, panX, panY)

  if (style === 'punch' && progress < 0.09) {
    ctx.fillStyle = `rgba(255,107,91,${0.18 * (1 - progress / 0.09)})`
    ctx.fillRect(0, 0, width, height)
  }

  if (style === 'clean') {
    const fade = Math.min(progress / 0.08, (1 - progress) / 0.08, 1)
    ctx.fillStyle = `rgba(0,0,0,${Math.max(0, 0.12 * (1 - fade))})`
    ctx.fillRect(0, 0, width, height)
  }
}

export function canExportLocally() {
  return Boolean(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream)
}

export async function exportVideo(options: ExportOptions): Promise<ExportResult> {
  if (!canExportLocally()) throw new Error('unsupported')
  const { media, audioFile, analysis, seconds, style, quality, onProgress } = options
  const width = quality === '1080' ? 1080 : 720
  const height = quality === '1080' ? 1920 : 1280
  const duration = Math.min(seconds, analysis.duration, 60)
  const prepared = await loadPrepared(media)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Canvas is unavailable')

  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) throw new Error('Web Audio unavailable')
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
  const recorder = new MediaRecorder(outputStream, mimeType ? { mimeType, videoBitsPerSecond: quality === '1080' ? 10_000_000 : 6_000_000 } : undefined)
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data)

  let currentScene = -1
  let activeVideo: HTMLVideoElement | undefined
  let frameId = 0
  let finished = false
  let startAt = 0

  const stopAllVideos = () => prepared.forEach((item) => item.video?.pause())

  const render = () => {
    if (finished) return
    const time = Math.min(Math.max(0, audioContext.currentTime - startAt), duration)
    const scene = sceneForTime(time, analysis.beats)
    const mediaIndex = scene.index % prepared.length
    const item = prepared[mediaIndex]

    if (scene.index !== currentScene) {
      activeVideo?.pause()
      currentScene = scene.index
      activeVideo = item.video
      if (activeVideo) {
        activeVideo.currentTime = 0
        void activeVideo.play().catch(() => undefined)
      }
    }

    renderFrame(ctx, item, width, height, style, scene.index, scene.progress)
    onProgress?.(Math.min(1, time / duration))
    if (time < duration) frameId = requestAnimationFrame(render)
  }

  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
  recorder.start(500)
  await audioContext.resume()
  startAt = audioContext.currentTime + 0.08
  audioSource.start(startAt, 0, duration)
  frameId = requestAnimationFrame(render)

  while (audioContext.currentTime - startAt < duration) await wait(100)
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
