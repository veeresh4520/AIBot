import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, type Plugin } from 'vite'
import path from 'node:path'
import fs from 'node:fs'

function githubPagesSpa(): Plugin {
  return {
    name: 'github-pages-spa',
    closeBundle() {
      const distDir = path.resolve(process.cwd(), 'dist')
      const indexPath = path.join(distDir, 'index.html')
      const notFoundPath = path.join(distDir, '404.html')
      const nojekyllPath = path.join(distDir, '.nojekyll')

      try {
        if (fs.existsSync(indexPath)) {
          fs.copyFileSync(indexPath, notFoundPath)
          console.log('✓ Created dist/404.html for GitHub Pages SPA routing')
        }
        fs.writeFileSync(nojekyllPath, '')
        console.log('✓ Created dist/.nojekyll for GitHub Pages asset serving')
      } catch (err) {
        console.warn('githubPagesSpa warning:', err)
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const isMobileBuild = mode === 'mobile' || process.env.CAPACITOR === 'true' || process.env.BUILD_TARGET === 'mobile';
  const base = process.env.VITE_BASE_PATH || (isMobileBuild ? './' : '/AIBot/');
  const rootPath = isMobileBuild ? '/' : '/AIBot/';

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      ...(!isMobileBuild ? [githubPagesSpa()] : []),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/*.png'],
        manifest: {
          id: rootPath,
          name: 'Plant Doctor',
          short_name: 'PlantDoc',
          description: 'Offline-first, evidence-grounded agricultural assistant',
          theme_color: '#15803D',
          background_color: '#F0FDF4',
          display: 'standalone',
          orientation: 'portrait-primary',
          scope: rootPath,
          start_url: rootPath,
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: 'icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          maximumFileSizeToCacheInBytes: 35 * 1024 * 1024,
          // Serve the cached app shell for any in-app navigation while offline.
          navigateFallback: isMobileBuild ? '/index.html' : '/AIBot/index.html',
          // Never fall back to the shell for API requests (kept on the network).
          navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // Static assets, onnx model, wasm runtimes, and Google Fonts are cached below.
        runtimeCaching: [
          {
            urlPattern: /\/models\/.*\.(?:onnx|json)$/i,
            handler: 'CacheFirst',
            options: { cacheName: 'plant-doctor-models-v1', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /\/packs\/.*\.json$/i,
            handler: 'CacheFirst',
            options: { cacheName: 'knowledge-packs-v1', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /\/ort\/.*\.(?:wasm|mjs|js)$/i,
            handler: 'CacheFirst',
            options: { cacheName: 'plant-doctor-models-v1', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-css', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-webfont', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
    ],
  };
});
