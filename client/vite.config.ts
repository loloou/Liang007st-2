import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { resolve } from 'path'

function devFetchProxy(): Plugin {
  return {
    name: 'liang007-dev-fetch-proxy',
    configureServer(server) {
      server.middlewares.use('/__liang007_proxy_fetch', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }))
          return
        }

        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          }

          const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
            url?: string
            method?: string
            headers?: Record<string, string>
            body?: string
            timeout?: number
          }

          if (!payload.url || !/^https?:\/\//i.test(payload.url)) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: '仅支持 HTTP/HTTPS URL' }))
            return
          }

          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), payload.timeout || 15000)
          const method = payload.method || 'GET'

          try {
            const response = await fetch(payload.url, {
              method,
              headers: payload.headers || {},
              body: method !== 'GET' ? payload.body : undefined,
              signal: controller.signal,
            })
            const contentType = response.headers.get('content-type') || ''
            const text = await response.text()
            let body: unknown = text
            if (contentType.includes('application/json')) {
              try {
                body = JSON.parse(text)
              } catch {
                body = text
              }
            }

            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(
              JSON.stringify({
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                body,
              }),
            )
          } finally {
            clearTimeout(timer)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const isTimeout = /abort|timeout/i.test(message)
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              ok: false,
              status: 0,
              statusText: isTimeout ? 'Timeout' : 'Network Error',
              body: null,
              error: isTimeout ? '请求超时' : `网络错误: ${message}`,
            }),
          )
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const isTest = mode === 'test'

  return {
    plugins: [react(), devFetchProxy()],
    server: {
      port: 5173,
      host: '0.0.0.0',
    },
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
    ...(isTest
      ? {
          test: {
            globals: true,
            environment: 'happy-dom',
            setupFiles: ['./src/test/setup.ts'],
            include: ['src/**/*.{test,spec}.{ts,tsx}'],
            coverage: {
              provider: 'v8',
              reporter: ['text', 'json', 'html'],
              include: ['src/**/*.{ts,tsx}'],
              exclude: ['src/**/*.d.ts', 'src/test/**'],
            },
          },
        }
      : {}),
  }
})
