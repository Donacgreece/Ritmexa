export type Language = 'en' | 'el'
export type MediaKind = 'image' | 'video'
export type EditStyle =
  | 'punch' | 'flow' | 'clean' | 'flash' | 'drift' | 'film' | 'zoom' | 'glitch'
  | 'shake' | 'whip' | 'pulse' | 'bounce' | 'spin' | 'blur' | 'chroma' | 'dream'
export type TransitionStyle = 'auto' | 'cut' | 'crossfade' | 'flash' | 'whip' | 'blur' | 'glitch'
export type ColorLook = 'natural' | 'vivid' | 'warm' | 'cool' | 'mono' | 'contrast'
export type OutputQuality = '720' | '1080'
export type CutMode = 'smart' | 'every' | 'strong' | 'custom'
export type AudioSourceKind = 'audio' | 'video'
export type MediaOrder = 'sequence' | 'shuffle'
export type CropMode = 'cover' | 'contain'
export type EditRecipe = 'viral' | 'smooth' | 'cinematic' | 'hyper' | 'minimal'

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
