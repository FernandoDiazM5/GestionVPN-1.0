import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/GestionVPN-1.0/',
  resolve: {
    // Garantiza que @xyflow/react use la misma instancia de React del proyecto
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
