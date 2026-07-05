import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Order Portal — public-facing page, served by the same Express server under /order.
// base:'/order/' makes every built asset URL resolve correctly at that subpath.
export default defineConfig({
  base: '/order/',
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
  build: { outDir: 'dist' }
})
