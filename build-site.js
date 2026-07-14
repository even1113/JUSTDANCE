import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const outDir = join(rootDir, 'dist')
const clientDir = join(outDir, 'client')
const serverDir = join(outDir, 'server')

const entries = [
  'index.html',
  'styles.css',
  'app.js',
  'ai.js',
  'components',
  'hooks',
  'services',
]

await rm(outDir, { recursive: true, force: true })
await mkdir(clientDir, { recursive: true })
await mkdir(serverDir, { recursive: true })
await mkdir(join(outDir, '.openai'), { recursive: true })

for (const entry of entries) {
  await cp(join(rootDir, entry), join(clientDir, entry), { recursive: true })
}

await cp(join(rootDir, '.openai', 'hosting.json'), join(outDir, '.openai', 'hosting.json'))
await writeFile(join(serverDir, 'index.js'), buildServerEntrypoint())

console.log(`Built static site into ${outDir}`)

function buildServerEntrypoint() {
  return `import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const clientDir = resolve(process.cwd(), 'dist/client')
const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '0.0.0.0'

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
  '.wasm': 'application/wasm'
}

const server = createServer(async (request, response) => {
  try {
    const filePath = resolveRequestPath(request.url || '/')
    const fileStat = await stat(filePath)

    if (!fileStat.isFile()) {
      sendNotFound(response)
      return
    }

    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    })
    createReadStream(filePath).pipe(response)
  } catch {
    sendNotFound(response)
  }
})

server.listen(port, host)

function resolveRequestPath(rawUrl) {
  const url = new URL(rawUrl, \`http://\${host}:\${port}\`)
  const pathname = decodeURIComponent(url.pathname)
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1)
  const normalizedPath = normalize(relativePath)
  const filePath = resolve(join(clientDir, normalizedPath))

  if (!filePath.startsWith(clientDir)) {
    throw new Error('Invalid path')
  }

  return filePath
}

function sendNotFound(response) {
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end('Not found')
}
`
}
