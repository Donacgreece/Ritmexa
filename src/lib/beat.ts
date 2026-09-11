import type { BeatAnalysis, CutMode } from '../types'

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))
  return sorted[index]
}

const median = (values: number[]) => percentile(values, 0.5)

const normalize = (values: number[], floor = 1e-7) => {
  const scale = Math.max(floor, percentile(values, 0.95))
  return values.map((value) => clamp(value / scale))
}

const nearestTempoInterval = (interval: number, target: number) => {
  const variants = [interval / 4, interval / 2, interval, interval * 2, interval * 4]
  return variants.reduce((best, value) => Math.abs(value - target) < Math.abs(best - target) ? value : best, variants[0])
}

const createWaveform = (channel: Float32Array, points = 144) => {
  if (!channel.length) return []
  const size = Math.max(1, Math.floor(channel.length / points))
  const result: number[] = []
  for (let start = 0; start < channel.length; start += size) {
    const end = Math.min(channel.length, start + size)
    let peak = 0
    let sum = 0
    for (let i = start; i < end; i += 1) {
      const value = Math.abs(channel[i])
      peak = Math.max(peak, value)
      sum += value
    }
    const mean = sum / Math.max(1, end - start)
    result.push(Math.min(1, peak * 0.65 + mean * 2.4))
    if (result.length >= points) break
  }
  const high = Math.max(0.001, percentile(result, 0.96))
  return result.map((value) => clamp(value / high))
}

const makeMono = (audio: AudioBuffer) => {
  const length = audio.length
  const channels = Math.max(1, audio.numberOfChannels)
  const mono = new Float32Array(length)
  for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
    const data = audio.getChannelData(channelIndex)
    for (let i = 0; i < length; i += 1) mono[i] += data[i] / channels
  }
  return mono
}

const estimateTempo = (novelty: number[], frameSeconds: number) => {
  const minBpm = 70
  const maxBpm = 180
  const minLag = Math.max(1, Math.floor(60 / maxBpm / frameSeconds))
  const maxLag = Math.max(minLag + 1, Math.ceil(60 / minBpm / frameSeconds))

  let bestLag = Math.max(minLag, Math.round(60 / 120 / frameSeconds))
  let bestScore = -Infinity
  let secondBest = -Infinity

  const scoreLag = (lag: number) => {
    let score = 0
    let weight = 0
    for (let i = lag; i < novelty.length; i += 1) {
      const gate = 0.15 + novelty[i]
      score += novelty[i] * novelty[i - lag] * gate
      weight += gate
    }
    return score / Math.max(1e-6, weight)
  }

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let score = scoreLag(lag)
    if (lag * 2 < novelty.length) score += scoreLag(lag * 2) * 0.16
    const bpm = 60 / (lag * frameSeconds)
    score *= 1 + Math.max(0, 1 - Math.abs(bpm - 120) / 120) * 0.035

    if (score > bestScore) {
      secondBest = bestScore
      bestScore = score
      bestLag = lag
    } else if (score > secondBest) {
      secondBest = score
    }
  }

  const bpm = Math.round(60 / (bestLag * frameSeconds))
  const prominence = bestScore <= 0 ? 0 : clamp((bestScore - Math.max(0, secondBest)) / bestScore * 4)
  return { bpm: Math.min(maxBpm, Math.max(minBpm, bpm)), prominence }
}

const alignBeatGrid = (
  novelty: number[],
  frameSeconds: number,
  bpm: number,
  peaks: number[],
  duration: number
) => {
  const interval = 60 / bpm
  const phaseSteps = Math.max(8, Math.round(interval / frameSeconds))
  let bestOffset = peaks[0] ?? 0
  let bestScore = -Infinity

  for (let step = 0; step < phaseSteps; step += 1) {
    const offset = step * interval / phaseSteps
    let score = 0
    let count = 0
    for (let time = offset; time < duration; time += interval) {
      const frame = Math.round(time / frameSeconds)
      let local = 0
      for (let j = -2; j <= 2; j += 1) local = Math.max(local, novelty[frame + j] ?? 0)
      score += local ** 1.35
      count += 1
    }
    score /= Math.max(1, count)
    if (score > bestScore) {
      bestScore = score
      bestOffset = offset
    }
  }

  const snapRadius = Math.min(0.095, interval * 0.22)
  const beats: number[] = []
  const strengths: number[] = []
  let peakCursor = 0

  for (let grid = bestOffset; grid < duration; grid += interval) {
    while (peakCursor < peaks.length && peaks[peakCursor] < grid - snapRadius) peakCursor += 1
    let beat = grid
    let bestDistance = snapRadius + 1
    for (let k = Math.max(0, peakCursor - 1); k <= Math.min(peaks.length - 1, peakCursor + 2); k += 1) {
      const distance = Math.abs(peaks[k] - grid)
      if (distance <= snapRadius && distance < bestDistance) {
        bestDistance = distance
        beat = peaks[k]
      }
    }

    if (beats.length && beat - beats[beats.length - 1] < interval * 0.55) continue
    const frame = Math.round(beat / frameSeconds)
    let strength = 0
    for (let j = -2; j <= 2; j += 1) strength = Math.max(strength, novelty[frame + j] ?? 0)
    beats.push(clamp(beat, 0, duration))
    strengths.push(clamp(strength))
  }

  return { beats, strengths, offset: bestOffset }
}

export async function analyzeAudio(file: File, sensitivity = 0.58): Promise<BeatAnalysis> {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) throw new Error('web-audio-unavailable')

  const context = new AudioContextCtor()
  try {
    const raw = await file.arrayBuffer()
    const audio = await context.decodeAudioData(raw.slice(0))
    const channel = makeMono(audio)
    const sampleRate = audio.sampleRate
    const hop = sampleRate >= 48000 ? 1024 : 768
    const frameSeconds = hop / sampleRate

    const rms: number[] = []
    const high: number[] = []

    for (let start = 0; start < channel.length; start += hop) {
      const end = Math.min(channel.length, start + hop)
      let square = 0
      let difference = 0
      let last = channel[start] ?? 0

      for (let i = start; i < end; i += 1) {
        const sample = channel[i]
        square += sample * sample
        difference += Math.abs(sample - last)
        last = sample
      }

      const length = Math.max(1, end - start)
      rms.push(Math.sqrt(square / length))
      high.push(difference / length)
    }

    const rmsFlux = rms.map((value, index) => Math.max(0, value - (rms[index - 1] ?? value)))
    const highFlux = high.map((value, index) => Math.max(0, value - (high[index - 1] ?? value)))
    const nrms = normalize(rms)
    const nrmsFlux = normalize(rmsFlux)
    const nhighFlux = normalize(highFlux)

    const novelty = nrmsFlux.map((value, index) => clamp(
      value * 0.54 +
      nhighFlux[index] * 0.34 +
      Math.max(0, nrms[index] - (nrms[index - 2] ?? nrms[index])) * 0.12
    ))

    const windowFrames = Math.max(5, Math.round(0.32 / frameSeconds))
    const thresholdMultiplier = 1.18 - clamp(sensitivity, 0.25, 0.9) * 0.62
    const minGapFrames = Math.max(1, Math.round(0.145 / frameSeconds))
    const peaks: number[] = []
    let lastPeak = -minGapFrames

    for (let i = 2; i < novelty.length - 2; i += 1) {
      const from = Math.max(0, i - windowFrames)
      const to = Math.min(novelty.length, i + Math.floor(windowFrames / 2))
      let sum = 0
      let square = 0
      let count = 0
      for (let j = from; j < to; j += 1) {
        sum += novelty[j]
        square += novelty[j] * novelty[j]
        count += 1
      }
      const mean = sum / Math.max(1, count)
      const variance = Math.max(0, square / Math.max(1, count) - mean * mean)
      const threshold = mean + Math.sqrt(variance) * thresholdMultiplier + 0.018
      const localMax = novelty[i] >= novelty[i - 1] && novelty[i] >= novelty[i + 1] && novelty[i] >= novelty[i - 2] && novelty[i] >= novelty[i + 2]

      if (localMax && novelty[i] > threshold && i - lastPeak >= minGapFrames) {
        peaks.push(i * frameSeconds)
        lastPeak = i
      }
    }

    const tempo = estimateTempo(novelty, frameSeconds)
    let bpm = tempo.bpm

    const peakIntervals = peaks.slice(1).map((value, index) => value - peaks[index]).filter((value) => value >= 0.18 && value <= 1.7)
    if (peakIntervals.length >= 5) {
      const beatInterval = 60 / bpm
      const aligned = peakIntervals.map((interval) => nearestTempoInterval(interval, beatInterval))
      const med = median(aligned)
      if (med > 0.25 && med < 0.9) {
        const peakBpm = 60 / med
        if (Math.abs(peakBpm - bpm) < 18) bpm = Math.round((bpm * 0.68) + (peakBpm * 0.32))
      }
    }

    bpm = Math.min(180, Math.max(70, bpm))
    const grid = alignBeatGrid(novelty, frameSeconds, bpm, peaks, audio.duration)
    const strongThreshold = Math.max(0.52, percentile(grid.strengths, 0.68))
    const strongBeats = grid.beats.filter((_, index) => grid.strengths[index] >= strongThreshold)

    const interval = 60 / bpm
    const deviations = peakIntervals.map((value) => {
      const aligned = nearestTempoInterval(value, interval)
      return Math.abs(aligned - interval) / interval
    }).filter((value) => Number.isFinite(value))
    const stability = clamp(1 - median(deviations) * 3.2)

    const peakCoverage = clamp(peaks.length / Math.max(10, audio.duration * 0.85))
    const confidence = clamp(0.3 + tempo.prominence * 0.28 + stability * 0.26 + peakCoverage * 0.16)
    const energy = clamp(nrms.reduce((sum, value) => sum + value, 0) / Math.max(1, nrms.length) * 1.45)

    return {
      beats: grid.beats,
      strongBeats,
      beatStrengths: grid.strengths,
      bpm,
      duration: audio.duration,
      confidence,
      stability,
      energy,
      offset: grid.offset,
      waveform: createWaveform(channel)
    }
  } catch (error) {
    console.error(error)
    throw new Error('audio-decode-failed')
  } finally {
    await context.close()
  }
}

export function selectEditBeats(
  analysis: BeatAnalysis,
  mode: CutMode,
  startAt: number,
  duration: number,
  customInterval = 0.75
) {
  const start = Math.max(0, startAt)
  const end = Math.min(analysis.duration, start + duration)
  const all = analysis.beats.filter((beat) => beat >= start && beat <= end)

  if (!all.length) return [start, end]

  if (mode === 'custom') {
    const interval = Math.min(4, Math.max(0.2, customInterval))
    const selected: number[] = [start]
    for (let time = start + interval; time <= end + 0.001; time += interval) selected.push(Math.min(time, end))
    return selected
  }

  if (mode === 'every') return [start, ...all.filter((beat) => beat > start + 0.04)]

  if (mode === 'strong') {
    const strong = analysis.strongBeats.filter((beat) => beat >= start && beat <= end)
    const fallback = all.filter((_, index) => index % Math.max(1, Math.round(analysis.bpm / 60)) === 0)
    const selected = strong.length >= 3 ? strong : fallback
    return [start, ...selected.filter((beat) => beat > start + 0.04)]
  }

  const selected: number[] = [start]
  const stride = analysis.bpm >= 132 ? 2 : 1
  let last = start
  const strongThreshold = Math.max(0.55, percentile(analysis.beatStrengths, 0.68))

  all.forEach((beat, index) => {
    const originalIndex = analysis.beats.indexOf(beat)
    const strength = originalIndex >= 0 ? analysis.beatStrengths[originalIndex] ?? 0 : 0
    const isStrong = strength >= strongThreshold
    const regular = index % stride === 0
    const gap = beat - last
    const shouldAdd = isStrong || (regular && gap >= 0.31) || gap >= 1.05

    if (shouldAdd && beat - last >= 0.24) {
      selected.push(beat)
      last = beat
    }
  })

  return selected.length >= 2 ? selected : [start, ...all.filter((_, index) => index % 2 === 0)]
}

export function strengthAtBeat(analysis: BeatAnalysis, beat: number) {
  if (!analysis.beats.length) return 0.5
  let bestIndex = 0
  let bestDistance = Infinity
  for (let i = 0; i < analysis.beats.length; i += 1) {
    const distance = Math.abs(analysis.beats[i] - beat)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = i
    }
    if (analysis.beats[i] > beat && distance > bestDistance) break
  }
  return analysis.beatStrengths[bestIndex] ?? 0.5
}
