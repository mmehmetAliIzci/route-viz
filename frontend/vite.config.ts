import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  // MapLibre finds its worker next to its own module; pre-bundling breaks that path.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  build: {
    rolldownOptions: {
      output: {
        // MapLibre is the bulk of the bundle and changes rarely; keep it, and React, out of the app chunk.
        codeSplitting: {
          groups: [
            { name: 'maplibre', test: /node_modules[\\/]maplibre-gl/ },
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Times render in the viewer's zone, so pin the machine's zone for every test.
    env: { TZ: 'America/Chicago' },
    setupFiles: ['./src/test-setup.ts'],
  },
})
