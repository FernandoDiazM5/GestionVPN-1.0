import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
// ANALYZE=1 npm run build → emite dist/stats.html con el treemap del bundle.
// 'npm run analyze' lo activa automáticamente.
const ANALYZE = process.env.ANALYZE === '1';

export default defineConfig({
  plugins: [
    react(),
    ANALYZE && visualizer({
      filename: 'dist/stats.html',
      template: 'treemap',
      gzipSize: true,
      brotliSize: true,
      open: false,
    }),
  ].filter(Boolean),
  base: '/GestionVPN-1.0/',
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: true, // Permite que Cloudflare o webs externas se conecten al servidor de desarrollo de Vite
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
})
