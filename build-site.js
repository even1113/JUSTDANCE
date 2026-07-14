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
  return `export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const assetRequest = url.pathname === '/'
      ? new Request(new URL('/index.html', url), request)
      : request

    const response = await env.ASSETS.fetch(assetRequest)
    if (response.status !== 404) return response

    return env.ASSETS.fetch(new Request(new URL('/index.html', url), request))
  }
}
`
}
