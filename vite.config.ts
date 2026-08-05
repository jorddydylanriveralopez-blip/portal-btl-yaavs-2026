import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function imageProxyPlugin(): Plugin {
  return {
    name: 'image-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || ''
        if (!rawUrl.startsWith('/image-proxy.php')) return next()

        try {
          const parsed = new URL(rawUrl, 'http://localhost')
          const target = parsed.searchParams.get('url')
          if (!target) {
            res.statusCode = 400
            res.end('URL inválida')
            return
          }

          const host = new URL(target).hostname.toLowerCase()
          const allowed =
            host.endsWith('.amazonaws.com') ||
            host.endsWith('.fillout.com') ||
            host.endsWith('.zite.com') ||
            host === 'fillout.com' ||
            host === 'zite.com' ||
            host === 'images.fillout.com'

          if (!allowed) {
            res.statusCode = 403
            res.end('Host no permitido')
            return
          }

          const upstream = await fetch(target, {
            headers: { Accept: 'image/*' },
          })
          if (!upstream.ok) {
            res.statusCode = 502
            res.end('No se pudo obtener la imagen')
            return
          }

          const buf = Buffer.from(await upstream.arrayBuffer())
          res.setHeader(
            'Content-Type',
            upstream.headers.get('content-type') || 'image/jpeg',
          )
          res.setHeader('Cache-Control', 'public, max-age=86400')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(buf)
        } catch {
          res.statusCode = 502
          res.end('Error de proxy')
        }
      })
    },
  }
}

// base './' para que funcione en carpeta raíz o subcarpeta de Hostinger
export default defineConfig({
  plugins: [react(), imageProxyPlugin()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
})
