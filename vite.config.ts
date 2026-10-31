import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { handleUpload, MAX_BYTES } from './api/_lib/upload.js'

/** Serves POST /api/upload in `vite dev` with the same code the Vercel route runs. */
function uploadApi(env: Record<string, string | undefined>): Plugin {
  return {
    name: 'climb-upload-api',
    configureServer(server) {
      server.middlewares.use('/api/upload', (req, res) => {
        const chunks: Buffer[] = []
        let size = 0
        let tooBig = false
        req.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_BYTES + 512 * 1024) tooBig = true
          else chunks.push(chunk)
        })
        req.on('end', () => {
          void (async () => {
            if (tooBig) {
              res.statusCode = 413
              res.setHeader('content-type', 'application/json')
              res.end(JSON.stringify({ error: 'That image is larger than 10 MB.' }))
              return
            }
            const headers = new Headers()
            for (const [k, v] of Object.entries(req.headers)) {
              if (typeof v === 'string') headers.set(k, v)
            }
            const request = new Request('http://localhost/api/upload', {
              method: req.method,
              headers,
              body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
            })
            const response = await handleUpload(request, { jwt: env.PINATA_JWT, env, ip: req.socket.remoteAddress })
            res.statusCode = response.status
            response.headers.forEach((value, key) => res.setHeader(key, value))
            res.end(Buffer.from(await response.arrayBuffer()))
          })()
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // PINATA_JWT stays server-side: it is read here (no VITE_ prefix) and never reaches the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), nodePolyfills(), uploadApi({ ...env, ...process.env })],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        '@tanstack/react-query',
        'wagmi',
        'wagmi/chains',
        'wagmi/connectors',
        'viem',
        'viem/chains',
        'connectkit',
        'framer-motion',
        'lucide-react',
        'sonner',
        'clsx',
        'tailwind-merge',
        'vite-plugin-node-polyfills/shims/buffer',
        'vite-plugin-node-polyfills/shims/global',
        'vite-plugin-node-polyfills/shims/process',
      ],
    },
    server: {
      allowedHosts: true,
      cors: true,
    },
  }
})
