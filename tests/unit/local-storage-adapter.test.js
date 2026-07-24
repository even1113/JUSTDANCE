import { describe, expect, test } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStorageAdapter } from '../../server/storage/local-storage-adapter.js'

describe('local storage adapter', () => {
  test('returns same-origin relative signed URLs instead of a configured development host', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'dancemirror-storage-test-'))
    const adapter = createLocalStorageAdapter({
      maxUploadBytes: 1024,
      publicBaseUrl: 'http://localhost:5173',
      rootDir,
      signingSecret: 'test-signing-secret-with-enough-entropy',
      urlTtlSec: 900,
    })

    try {
      const upload = await adapter.createUploadTarget({
        contentType: 'video/mp4',
        key: 'sessions/session_1/uploads/teacher.mp4',
      })

      expect(upload.url).toMatch(/^\/api\/storage\/upload\/sessions%2Fsession_1%2Fuploads%2Fteacher\.mp4\?expires=\d+&signature=/)
      expect(upload.url).not.toContain('localhost')
    } finally {
      await rm(rootDir, { force: true, recursive: true })
    }
  })
})
