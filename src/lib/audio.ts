type ProgressCallback = (progress: number, label?: string) => void

const getAudioContext = () => {
  const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) throw new Error('web-audio-unavailable')
  return Ctor
}

const waitForMetadata = (media: HTMLMediaElement) => new Promise<void>((resolve, reject) => {
  if (media.readyState >= 1) {
    resolve()
    return
  }

  const ok = () => {
    cleanup()
    resolve()
  }
  const fail = () => {
    cleanup()
    reject(new Error('media-read-failed'))
  }
  const cleanup = () => {
    media.removeEventListener('loadedmetadata', ok)
    media.removeEventListener('error', fail)
  }

  media.addEventListener('loadedmetadata', ok, { once: true })
  media.addEventListener('error', fail, { once: true })
})

function audioBufferToWav(buffer: AudioBuffer) {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels))
  const sampleRate = buffer.sampleRate
  const length = buffer.length
  const bytesPerSample = 2
  const blockAlign = channels * bytesPerSample
  const dataSize = length * blockAlign
  const output = new ArrayBuffer(44 + dataSize)
  const view = new DataView(output)

  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, dataSize, true)

  const left = buffer.getChannelData(0)
  const right = channels > 1 ? buffer.getChannelData(1) : left
  let cursor = 44

  for (let i = 0; i < length; i += 1) {
    const samples = channels === 2 ? [left[i], right[i]] : [left[i]]
    for (const sample of samples) {
      const value = Math.max(-1, Math.min(1, sample))
      view.setInt16(cursor, value < 0 ? value * 0x8000 : value * 0x7fff, true)
      cursor += 2
    }
  }

  return new Blob([output], { type: 'audio/wav' })
}

async function decodeVideoDirectly(file: File, onProgress?: ProgressCallback) {
  const Ctor = getAudioContext()
  const context = new Ctor()

  try {
    onProgress?.(0.08, 'Reading soundtrack')
    const bytes = await file.arrayBuffer()
    const buffer = await context.decodeAudioData(bytes.slice(0))
    onProgress?.(0.78, 'Preparing soundtrack')
    const wav = audioBufferToWav(buffer)
    return new File([wav], `${file.name.replace(/\.[^.]+$/, '')}-soundtrack.wav`, { type: 'audio/wav' })
  } finally {
    await context.close()
  }
}

async function extractVideoAudioRealtime(file: File, onProgress?: ProgressCallback) {
  const Ctor = getAudioContext()
  const context = new Ctor()
  const video = document.createElement('video')
  const url = URL.createObjectURL(file)

  video.src = url
  video.preload = 'auto'
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.style.position = 'fixed'
  video.style.left = '-2px'
  video.style.bottom = '0'
  video.style.width = '1px'
  video.style.height = '1px'
  video.style.opacity = '0.001'
  video.style.pointerEvents = 'none'
  document.body.appendChild(video)

  try {
    await waitForMetadata(video)
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('video-duration-unavailable')

    const targetDuration = Math.min(video.duration, 180)
    const source = context.createMediaElementSource(video)
    const processor = context.createScriptProcessor(4096, 2, 2)
    const silentGain = context.createGain()
    silentGain.gain.value = 0

    const leftChunks: Float32Array[] = []
    const rightChunks: Float32Array[] = []

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer
      if (!input.numberOfChannels) return
      leftChunks.push(new Float32Array(input.getChannelData(0)))
      rightChunks.push(new Float32Array(input.getChannelData(Math.min(1, input.numberOfChannels - 1))))
    }

    source.connect(processor)
    processor.connect(silentGain)
    silentGain.connect(context.destination)

    await context.resume()
    video.currentTime = 0
    onProgress?.(0.03, 'Extracting soundtrack')

    const finished = new Promise<void>((resolve, reject) => {
      let frame = 0

      const tick = () => {
        const progress = Math.min(1, video.currentTime / targetDuration)
        onProgress?.(0.05 + progress * 0.76, 'Extracting soundtrack')

        if (video.currentTime >= targetDuration || video.ended) {
          cancelAnimationFrame(frame)
          resolve()
          return
        }

        frame = requestAnimationFrame(tick)
      }

      video.addEventListener('error', () => reject(new Error('video-audio-extraction-failed')), { once: true })
      frame = requestAnimationFrame(tick)
    })

    await video.play()
    await finished
    video.pause()

    source.disconnect()
    processor.disconnect()
    silentGain.disconnect()

    const total = leftChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    if (!total) throw new Error('video-has-no-audio')

    const audioBuffer = context.createBuffer(2, total, context.sampleRate)
    const left = audioBuffer.getChannelData(0)
    const right = audioBuffer.getChannelData(1)
    let cursor = 0

    for (let i = 0; i < leftChunks.length; i += 1) {
      left.set(leftChunks[i], cursor)
      right.set(rightChunks[i], cursor)
      cursor += leftChunks[i].length
    }

    onProgress?.(0.88, 'Preparing soundtrack')
    const wav = audioBufferToWav(audioBuffer)
    return new File([wav], `${file.name.replace(/\.[^.]+$/, '')}-soundtrack.wav`, { type: 'audio/wav' })
  } finally {
    video.pause()
    video.remove()
    URL.revokeObjectURL(url)
    await context.close()
  }
}

export async function prepareAudioSource(file: File, onProgress?: ProgressCallback) {
  const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name)

  if (!isVideo) {
    onProgress?.(1, 'Ready')
    return file
  }

  try {
    const prepared = await decodeVideoDirectly(file, onProgress)
    onProgress?.(1, 'Ready')
    return prepared
  } catch {
    const prepared = await extractVideoAudioRealtime(file, onProgress)
    onProgress?.(1, 'Ready')
    return prepared
  }
}
