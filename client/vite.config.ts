import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// 从根 package.json 读取版本号
const rootPkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8')) as {
  version: string
}
const APP_VERSION = rootPkg.version

const ALLOWED_PROXY_METHODS = new Set(['GET', 'POST'])
const ALLOWED_PROXY_HEADERS = new Set(['accept', 'authorization', 'content-type'])
const MAX_PROXY_TIMEOUT_MS = 600_000

function isBlockedProxyHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.includes(':')
  )
}

function normalizeProxyUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('仅支持 HTTP/HTTPS URL')
  }
  if (isBlockedProxyHostname(parsed.hostname)) {
    throw new Error('代理请求不允许访问本机、局域网名称或裸 IP 地址')
  }
  return parsed.toString()
}

function sanitizeProxyHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const safeHeaders: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (ALLOWED_PROXY_HEADERS.has(key.toLowerCase()) && typeof value === 'string') {
      safeHeaders[key] = value
    }
  }
  return safeHeaders
}

function normalizeProxyMethod(method?: string): string {
  const normalized = String(method || 'GET').toUpperCase()
  return ALLOWED_PROXY_METHODS.has(normalized) ? normalized : 'GET'
}

function normalizeProxyTimeout(timeout?: number): number {
  const value = Number(timeout || 15_000)
  return Math.max(1_000, Math.min(Number.isFinite(value) ? value : 15_000, MAX_PROXY_TIMEOUT_MS))
}

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

          const safeUrl = normalizeProxyUrl(payload.url || '')
          const method = normalizeProxyMethod(payload.method)
          const timeout = normalizeProxyTimeout(payload.timeout)

          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), timeout)

          try {
            const response = await fetch(safeUrl, {
              method,
              headers: sanitizeProxyHeaders(payload.headers),
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
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
    server: {
      port: 5173,
      host: '127.0.0.1',
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:17438',
          changeOrigin: true,
        },
        '/generate': {
          target: 'http://127.0.0.1:17438',
          changeOrigin: true,
        },
        '/ws': {
          target: 'http://127.0.0.1:17438',
          ws: true,
        },
      },
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
