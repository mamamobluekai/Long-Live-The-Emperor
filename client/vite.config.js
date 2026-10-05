import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Added alongside the existing plugins, not replacing them.
    //
    // Caching is deliberately limited to built frontend assets (JS/CSS/HTML/
    // icons/fonts). `navigateFallback` serves index.html for client-side routes
    // only, which is what keeps react-router deep links working offline-ish.
    //
    // Runtime Caching has NO entries on purpose: this app's data (attendance,
    // GPS, evaluations, documents, notifications, profile) must always come from
    // the live backend. Without an explicit entry, Workbox passes every request
    // straight through to the network untouched, so /api/*, auth, Socket.IO
    // handshakes and file uploads are unaffected.
    VitePWA({
      registerType: 'autoUpdate',
      // Dev-server PWA support is opt-in; leaving it off keeps `npm run dev`
      // behaving exactly as before.
      devOptions: {
        enabled: false,
      },
      includeAssets: ['favicon.svg', 'logo.png', 'tablogo.png'],
      manifest: {
        name: 'Work Immersion Management System',
        short_name: 'WIMS',
        description: 'Work Immersion Management System',
        theme_color: '#581725',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          // Android crops maskable icons to its own shape, so this variant keeps
          // the seal inside the 80% safe zone instead of edge-to-edge.
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Never precache or serve these from cache. The API lives on a different
        // origin in every environment, and the assets below are auth/transport
        // related rather than page content.
        globIgnores: ['**/node_modules/**'],
        // Bump this whenever the caching strategy genuinely changes so returning
        // installs pick up the new worker.
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
})