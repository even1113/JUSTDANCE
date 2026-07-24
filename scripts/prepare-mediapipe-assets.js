import { access, copyFile, cp, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('..', import.meta.url))
const packageDir = join(rootDir, 'node_modules', '@mediapipe', 'tasks-vision')
const vendorDir = join(rootDir, 'vendor', 'mediapipe')
const modelPath = join(vendorDir, 'pose_landmarker_lite.task')
const defaultModelUrl = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

await mkdir(vendorDir, { recursive: true })
await copyFile(join(packageDir, 'vision_bundle.mjs'), join(vendorDir, 'vision_bundle.mjs'))
await cp(join(packageDir, 'wasm'), join(vendorDir, 'wasm'), {
  force: true,
  recursive: true,
})

if (!(await isUsableModel(modelPath))) {
  await downloadModel(process.env.MEDIAPIPE_MODEL_SOURCE_URL || defaultModelUrl, modelPath)
}

await writeFile(join(vendorDir, 'VERSION'), 'tasks-vision=0.10.35\npose-landmarker-lite=float16/1\n')
console.log('MediaPipe browser assets are ready')

async function isUsableModel(filePath) {
  try {
    await access(filePath)
    return (await stat(filePath)).size > 1_000_000
  } catch {
    return false
  }
}

async function downloadModel(url, outputPath) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`MediaPipe model download failed (${response.status})`)
  }

  const bytes = new Uint8Array(await response.arrayBuffer())

  if (bytes.byteLength < 1_000_000) {
    throw new Error('MediaPipe model download returned an invalid file')
  }

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, bytes)
}
