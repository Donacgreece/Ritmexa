export type Language = 'en' | 'el'
export type MediaKind = 'image' | 'video'
export type EditStyle = 'punch' | 'flow' | 'clean'
export type OutputQuality = '720' | '1080'

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
  bpm: number
  duration: number
  confidence: number
}

export interface ExportResult {
  blob: Blob
  url: string
  filename: string
  mimeType: string
}
