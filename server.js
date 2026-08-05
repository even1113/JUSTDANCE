import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApiRouter } from './server/apiRouter.js'
import { loadConfig } from './server/config.js'
import { createApiRuntime } from './server/runtime.js'

const defaultRootDir = fileURLToPath(new URL('.', import.meta.url))
const publicRootFiles = new Set(['app.js', 'index.html', 'styles.css', 'favicon.ico'])
const publicDirectories = new Set(['components', 'hooks', 'services', 'vendor'])

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
}

function createDanceMirrorServer(options) {
  const rootDir = resolve(options.rootDir || defaultRootDir)
  const { config, queue, storage, store } = options.runtime
  const handleApiRequest = createApiRouter({ config, queue, storage, store })

  return createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost')
    if (await storage.handleSignedRequest(request, response, url)) return
    if (await handleApiRequest(request, response)) return

    try {
      const filePath = resolveRequestPath(request.url || '/', rootDir)
      const fileStat = await stat(filePath)
      if (!fileStat.isFile()) return sendNotFound(response)

      response.writeHead(200, {
        'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': [
          "default-src 'self'",
          "connect-src 'self' https://*.aliyuncs.com",
          "img-src 'self' data: blob:",
          "media-src 'self' blob: https://*.aliyuncs.com",
          "script-src 'self' 'wasm-unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "worker-src 'self' blob:",
        ].join('; '),
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      })
      createReadStream(filePath).pipe(response)
    } catch {
      sendNotFound(response)
    }
  })
}

async function createConfiguredServer(options = {}) {
  const config = options.config || loadConfig({ rootDir: options.rootDir || defaultRootDir })
  const runtime = options.runtime || await createApiRuntime(config)
  const server = createDanceMirrorServer({ rootDir: options.rootDir, runtime })
  return { config, runtime, server }
}

function resolveRequestPath(rawUrl, rootDir) {
  const url = new URL(rawUrl, 'http://localhost')
  const pathname = decodeURIComponent(url.pathname)
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1)
  const normalizedRelativePath = normalize(relativePath).replaceAll('\\', '/')
  const [topLevel] = normalizedRelativePath.split('/')
  if (!publicRootFiles.has(normalizedRelativePath) && !publicDirectories.has(topLevel)) {
    throw new Error('Private path')
  }
  const filePath = resolve(join(rootDir, normalize(relativePath)))
  const relation = relative(rootDir, filePath)
  if (relation === '..' || relation.startsWith(`..${sep}`)) throw new Error('Invalid path')
  return filePath
}

function sendNotFound(response) {
  if (response.headersSent) return response.end()
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end('Not found')
}

async function startServer() {
  const configured = await createConfiguredServer()
  configured.server.listen(configured.config.port, configured.config.host, () => {
    console.log(`DanceMirror API and H5: ${configured.config.publicBaseUrl}/`)
  })

  const shutdown = async () => {
    configured.server.close()
    await configured.runtime.close()
    process.exit(0)
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  return configured
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMainModule) {
  startServer().catch((error) => {
    console.error(`Server startup failed: ${error.code || error.message}`)
    process.exitCode = 1
  })
}

export {
  createConfiguredServer,
  createDanceMirrorServer,
  resolveRequestPath,
  startServer,
}
