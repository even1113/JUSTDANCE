import { describe, expect, test, vi } from 'vitest'
import { createOssStorageAdapter } from '../../server/storage/oss-storage-adapter.js'

describe('OSS storage adapter', () => {
  test('uses the public signing client while object operations use the internal client', async () => {
    const client = {
      getBucketACL: vi.fn().mockResolvedValue({ acl: 'private' }),
      head: vi.fn().mockResolvedValue({
        res: { headers: { 'content-length': '2048', 'last-modified': 'now' } },
      }),
    }
    const signingClient = {
      signatureUrl: vi.fn((key, options) => `https://public-oss.example/${key}?method=${options.method}`),
    }
    const adapter = createOssStorageAdapter({
      client,
      signingClient,
      urlTtlSec: 900,
    })

    await adapter.initialize()
    const upload = await adapter.createUploadTarget({
      key: 'sessions/session_1/teacher/original.mp4',
      contentType: 'video/mp4',
    })
    const playback = await adapter.createReadUrl('sessions/session_1/teacher/processed.mp4')
    const info = await adapter.getObjectInfo('sessions/session_1/teacher/processed.mp4')

    expect(upload.url).toContain('public-oss.example')
    expect(playback).toContain('public-oss.example')
    expect(info.sizeBytes).toBe(2048)
    expect(signingClient.signatureUrl).toHaveBeenCalledTimes(2)
    expect(client.head).toHaveBeenCalledTimes(1)
  })

  test('refuses a bucket that is not private', async () => {
    const adapter = createOssStorageAdapter({
      client: { getBucketACL: vi.fn().mockResolvedValue({ acl: 'public-read' }) },
      signingClient: { signatureUrl: vi.fn() },
      urlTtlSec: 900,
    })

    await expect(adapter.initialize()).rejects.toMatchObject({ code: 'oss_bucket_not_private' })
  })
})
