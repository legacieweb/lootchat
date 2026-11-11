import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { adminAuthMiddleware } from './server/admin-auth.mjs'

const port = parseInt(process.env.PORT || '5173', 10)

export default defineConfig({
  server: { port, host: true },
  preview: { port, host: true },
  plugins: [{
    ...react(),
    configureServer(server) { server.middlewares.use(adminAuthMiddleware()) },
    configurePreviewServer(server) { server.middlewares.use(adminAuthMiddleware()) },
  }],
})
