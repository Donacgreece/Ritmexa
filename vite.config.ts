import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon-v027.png',
        'brand-mark-v030.png',
        'launch/*.png'
      ],
      manifest: {
        name: 'Ritmexa',
        short_name: 'Ritmexa',
        description: 'Beat synced vertical edits from photos, clips and your own soundtrack.',
        theme_color: '#ff2d3a',
        background_color: '#dbf6ff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        categories: ['photo', 'video', 'music'],
        icons: [
          { src: 'pwa-192x192-v027.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512-v027.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512-v027.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,ico}']
      }
    })
  ]
})
