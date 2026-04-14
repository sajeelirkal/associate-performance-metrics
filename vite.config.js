import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    // Explicit HMR config — required when the project path contains spaces
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
    },
    // Make chokidar watch the whole project root, including paths with spaces
    watch: {
      usePolling: false,
      ignored: ['**/node_modules/**', '**/.git/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: false,
      },
    },
  },
})
