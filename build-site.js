import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const outDir = join(rootDir, 'dist')
const clientDir = join(outDir, 'client')
const serverDir = join(outDir, 'server')

const entries = [
  'index.html',
  'styles.css',
  'app.js',
  'components',
  'hooks',
  'services',
  'vendor',
]

await rm(outDir, { recursive: true, force: true })
await mkdir(clientDir, { recursive: true })
await mkdir(serverDir, { recursive: true })
await mkdir(join(outDir, '.openai'), { recursive: true })

for (const entry of entries) {
  await cp(join(rootDir, entry), join(clientDir, entry), { recursive: true })
}

await cp(join(rootDir, '.openai', 'hosting.json'), join(outDir, '.openai', 'hosting.json'))

const staticAssets = await collectClientAssets(clientDir)
await writeFile(join(serverDir, 'index.js'), buildServerEntrypoint(staticAssets))

console.log(`Built static site into ${outDir}`)

async function collectClientAssets(directory, baseDirectory = directory) {
  const assets = {}
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name)

    if (entry.isDirectory()) {
      Object.assign(assets, await collectClientAssets(absolutePath, baseDirectory))
      continue
    }

    const routePath = `/${relative(baseDirectory, absolutePath).split(sep).join('/')}`
    const fileBuffer = await readFile(absolutePath)

    assets[routePath] = {
      body: fileBuffer.toString('base64'),
      contentType: getContentType(routePath),
    }
  }

  return assets
}

function buildServerEntrypoint(staticAssetMap) {
  return `const STATIC_ASSETS = ${JSON.stringify(staticAssetMap)}

export default {
  async fetch(request) {
    const url = new URL(request.url)
    const path = normalizePath(url.pathname)
    const asset = STATIC_ASSETS[path] || getFallbackAsset(request, path)

    if (!asset) {
      return new Response('Not found', { status: 404 })
    }

    const headers = new Headers({
      'content-type': asset.contentType,
      'cache-control': path === '/index.html'
        ? 'no-cache'
        : 'public, max-age=31536000, immutable',
    })

    return new Response(decodeBase64(asset.body), { headers })
  }
}

function normalizePath(pathname) {
  if (pathname === '/') return '/index.html'

  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}

function getFallbackAsset(request, pathname) {
  if (pathname.includes('.')) return null

  const accept = request.headers.get('accept') || ''
  return accept.includes('text/html') || accept.includes('*/*')
    ? STATIC_ASSETS['/index.html']
    : null
}

function decodeBase64(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}
`
}

function getContentType(filePath) {
  const extension = extname(filePath)
  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
  }

  return contentTypes[extension] || 'application/octet-stream'
}
