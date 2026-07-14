import { cp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const outDir = join(rootDir, 'dist')

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
await mkdir(outDir, { recursive: true })

for (const entry of entries) {
  await cp(join(rootDir, entry), join(outDir, entry), { recursive: true })
}

console.log(`Built static site into ${outDir}`)
