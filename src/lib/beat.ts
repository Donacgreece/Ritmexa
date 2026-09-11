import type { BeatAnalysis } from '../types'

const clampBpm = (bpm: number) => {
  let value = bpm
  while (value < 75) value *= 2
  while (value > 170) value /= 2
  return Math.round(value)
}

export async function analyzeAudio(file: File): Promise<BeatAnalysis> {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) throw new Error('Web Audio is not supported')

  const context = new AudioContextCtor()
  try {
    const buffer = await file.arrayBuffer()
    const audio = await context.decodeAudioData(buffer.slice(0))
    const channel = audio.getChannelData(0)
    const sampleRate = audio.sampleRate
    const hop = 1024
    const energies: number[] = []

    for (let start = 0; start < channel.length; start += hop) {
      let sum = 0
      const end = Math.min(start + hop, channel.length)
      for (let i = start; i < end; i += 1) sum += channel[i] * channel[i]
      energies.push(Math.sqrt(sum / Math.max(1, end - start)))
    }

    const novelty = energies.map((energy, index) => Math.max(0, energy - (energies[index - 1] ?? energy)))
    const mean = novelty.reduce((a, b) => a + b, 0) / Math.max(1, novelty.length)
    const variance = novelty.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, novelty.length)
    const threshold = mean + Math.sqrt(variance) * 1.15
    const minFrames = Math.max(1, Math.round((0.23 * sampleRate) / hop))
    const peaks: number[] = []
    let lastPeak = -minFrames

    for (let i = 2; i < novelty.length - 2; i += 1) {
      const localMax = novelty[i] >= novelty[i - 1] && novelty[i] >= novelty[i + 1]
      if (localMax && novelty[i] > threshold && i - lastPeak >= minFrames) {
        peaks.push((i * hop) / sampleRate)
        lastPeak = i
      }
    }

    const intervals = peaks.slice(1).map((peak, index) => peak - peaks[index]).filter((value) => value > 0.2 && value < 1.5)
    const sorted = [...intervals].sort((a, b) => a - b)
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0.5
    const bpm = clampBpm(60 / median)
    const beatInterval = 60 / bpm

    let beats = peaks
    if (beats.length < Math.max(8, audio.duration / 2)) {
      const first = peaks[0] ?? 0
      beats = []
      for (let time = first; time < audio.duration; time += beatInterval) beats.push(time)
    }

    const density = beats.length / Math.max(1, audio.duration)
    const confidence = Math.max(0.35, Math.min(0.98, 0.45 + Math.min(peaks.length, 40) / 80 + Math.min(density, 2) / 8))

    return {
      beats: beats.filter((time) => time >= 0 && time <= audio.duration),
      bpm,
      duration: audio.duration,
      confidence
    }
  } finally {
    await context.close()
  }
}
