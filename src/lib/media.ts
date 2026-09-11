import type { MediaItem, MediaKind } from '../types'

const uniqueId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

const extension = (name: string) => name.toLowerCase().split('.').pop() ?? ''

const kindForFile = (file: File): MediaKind | null => {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  const ext = extension(file.name)
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'm4v', 'webm', 'avi'].includes(ext)) return 'video'
  return null
}

export async function filesToMedia(files: File[]): Promise<MediaItem[]> {
  const accepted = files.map((file) => ({ file, kind: kindForFile(file) })).filter((item): item is { file: File; kind: MediaKind } => Boolean(item.kind)).slice(0, 50)

  return Promise.all(accepted.map(async ({ file, kind }) => {
    const item: MediaItem = {
      id: uniqueId(),
      file,
      url: URL.createObjectURL(file),
      name: file.name,
      kind
    }

    if (kind === 'video') {
      item.duration = await new Promise<number>((resolve) => {
        const video = document.createElement('video')
        video.preload = 'metadata'
        video.muted = true
        video.playsInline = true
        video.src = item.url
        video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) ? video.duration : 0)
        video.onerror = () => resolve(0)
      })
    }

    return item
  }))
}

export function revokeMedia(items: MediaItem[]) {
  items.forEach((item) => URL.revokeObjectURL(item.url))
}
