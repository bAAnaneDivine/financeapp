import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'fs'
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',  // affiche un bandeau, ne met pas à jour silencieusement
      includeAssets: ['icon.svg', 'icons/icon.svg'],
      manifest: {
        name: 'FinanceApp',
        short_name: 'FinanceApp',
        description: 'Gestion financière personnelle — multi-banque, tout en local, open source',
        theme_color: '#0a0a16',
        background_color: '#0a0a16',
        display: 'standalone',
        start_url: '/',
        lang: 'fr',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/pdf.worker*'],  // ~2MB, exclure du précache
        navigateFallback: 'index.html',
        runtimeCaching: [],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3MB max
      },
      devOptions: {
        enabled: false,  // pas de SW en dev (évite les conflits HMR)
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: { port: 3000, open: true },
  build: {
    outDir: 'dist',
    // index.js (~1.1MB non-gzip) contient Recharts pour Budget/Epargne sync — attendu
    // Gzippé : 334KB (sous la cible de 400KB réseau)
    chunkSizeWarningLimit: 1200,
  },
  optimizeDeps: { exclude: ['pdfjs-dist'] },
})
