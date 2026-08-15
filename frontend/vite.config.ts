import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev proxy: /api -> FastAPI backend. Set VITE_API_URL to override.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://roadsafe-backend.onrender.com',
        changeOrigin: true,
      },
    },
  },
})
