export type Language = 'en' | 'el'
export type MediaKind = 'image' | 'video'
export type EditStyle = 'punch' | 'flow' | 'clean' | 'flash' | 'drift' | 'film' | 'zoom' | 'glitch'
export type OutputQuality = '720' | '1080'
export type CutMode = 'smart' | 'every' | 'strong'
export type AudioSourceKind = 'audio' | 'video'

export interface MediaItem {
  id: string
  file: File
  url: string
  name: string
  kind: MediaKind
  duration?: number
}

export interface BeatAnalysis {
  beats: number[]
  strongBeats: number[]
  beatStrengths: number[]
  bpm: number
  duration: number
  confidence: number
  stability: number
  energy: number
  offset: number
  waveform: number[]
}

export interface ExportResult {
  blob: Blob
  url: string
  filename: string
  mimeType: string
}
