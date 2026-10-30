import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const port = Number(process.env.PORT || 5173)
const apiProxy = {
  '/api': {
    target: process.env.API_TARGET || 'http://localhost:8000',
    changeOrigin: false,
  },
}

// Tokens still live in browser storage, so lock down script execution in the
// production build. Vite dev needs inline scripts, hence build-only.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://avatars.githubusercontent.com",
  "connect-src 'self' https://api.github.com",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ')

const cspPlugin = {
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace(
      '<head>',
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
    )
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cspPlugin],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx,ts,tsx}'],
  },
  server: {
    port,
    strictPort: true,
    // Explicit HMR config — required when the project path contains spaces
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port,
    },
    proxy: apiProxy,
  },
  preview: {
    port,
    strictPort: true,
    host: 'localhost',
    proxy: apiProxy,
  },
})
