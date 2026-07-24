import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDanceMirrorServer } from '../../server.js'
import { loadConfig } from '../../server/config.js'
import { createApiRuntime } from '../../server/runtime.js'

async function startTestServer(options = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'dancemirror-test-'))
  const config = loadConfig({
    rootDir,
    env: {
      NODE_ENV: 'test',
      RUNTIME_MODE: 'embedded',
      STORAGE_DRIVER: 'local',
      PUBLIC_BASE_URL: 'http://127.0.0.1',
      MEDIA_SIGNING_SECRET: 'test-signing-secret-with-enough-entropy',
    },
  })
  const runtime = await createApiRuntime(config, {
    modelClient: options.modelClient === undefined ? null : options.modelClient,
  })
  const server = createDanceMirrorServer({ rootDir, runtime })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()

  return {
    origin: `http://127.0.0.1:${address.port}`,
    runtime,
    server,
    async close() {
      await new Promise((resolve) => server.close(resolve))
      await runtime.close()
      await rm(rootDir, { force: true, recursive: true })
    },
  }
}

async function seedReadyVideos(runtime, sessionId, token) {
  for (const role of ['teacher', 'user']) {
    const video = await runtime.store.createVideoAsset(sessionId, token, {
      role,
      originalName: `${role}.mp4`,
      inputFormat: 'mp4',
      contentType: 'video/mp4',
      sizeBytes: 1024,
      storageKey: `sessions/${sessionId}/${role}/original.mp4`,
    })
    await runtime.store.completeVideoUpload(video.id, token)
    await runtime.store.updateVideo(video.id, {
      status: 'ready',
      processedStorageKey: `sessions/${sessionId}/${role}/processed.mp4`,
      metadata: {
        durationSec: 12,
        width: 720,
        height: 1280,
        videoCodec: 'h264',
        audioCodec: 'aac',
      },
    })
  }
}

export { seedReadyVideos, startTestServer }
