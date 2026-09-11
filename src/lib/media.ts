import type { MediaItem } from '../types'

const uniqueId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

export async function filesToMedia(files: File[]): Promise<MediaItem[]> {
  const accepted = files.filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/')).slice(0, 30)
  return Promise.all(accepted.map(async (file) => {
    const kind = file.type.startsWith('video/') ? 'video' : 'image'
    const item: MediaItem = { id: uniqueId(), file, url: URL.createObjectURL(file), name: file.name, kind }
    if (kind === 'video') {
      item.duration = await new Promise<number>((resolve) => {
        const video = document.createElement('video')
        video.preload = 'metadata'
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
