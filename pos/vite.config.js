import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Pawvy POS System — public-facing checkout used at physical events,
// served by the same Express server under /pos. base:'/pos/' makes every
// built asset URL resolve correctly at that subpath.
export default defineConfig({
  base: '/pos/',
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
  build: { outDir: 'dist' }
})
