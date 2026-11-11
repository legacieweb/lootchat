import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { adminAuthMiddleware } from './server/admin-auth.mjs'

const port = parseInt(process.env.PORT || '5173', 10)
const renderHost = process.env.RENDER_EXTERNAL_HOSTNAME
const previewAllowedHosts = renderHost
  ? renderHost.split(',').map(h => h.trim()).filter(Boolean)
  : ['localhost']

export default defineConfig({
  server: { port, host: true, allowedHosts: true },
  preview: { port, host: true, allowedHosts: previewAllowedHosts },
  plugins: [{
    ...react(),
    configureServer(server) { server.middlewares.use(adminAuthMiddleware()) },
    configurePreviewServer(server) { server.middlewares.use(adminAuthMiddleware()) },
  }],
})
