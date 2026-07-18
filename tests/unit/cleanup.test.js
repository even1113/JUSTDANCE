import { describe, expect, test, vi } from 'vitest'
import { cleanupExpiredSessions } from '../../server/cleanup.js'

describe('expired session cleanup', () => {
  test('deletes object prefixes before purging database records', async () => {
    const calls = []
    const store = {
      initialize: vi.fn(),
      listExpiredSessions: vi.fn().mockResolvedValue(['session_1', 'session_2']),
      purgeSession: vi.fn(async (id) => calls.push(`purge:${id}`)),
    }
    const storage = {
      initialize: vi.fn(),
      removePrefix: vi.fn(async (prefix) => calls.push(`storage:${prefix}`)),
    }

    const result = await cleanupExpiredSessions({
      config: { runtimeMode: 'persistent' },
      storage,
      store,
    })

    expect(result).toEqual({ deleted: 2 })
    expect(calls).toEqual([
      'storage:sessions/session_1/',
      'purge:session_1',
      'storage:sessions/session_2/',
      'purge:session_2',
    ])
  })

  test('does not purge database state when object deletion fails', async () => {
    const store = {
      initialize: vi.fn(),
      listExpiredSessions: vi.fn().mockResolvedValue(['session_1']),
      purgeSession: vi.fn(),
    }
    const storage = {
      initialize: vi.fn(),
      removePrefix: vi.fn().mockRejectedValue(new Error('oss unavailable')),
    }

    await expect(cleanupExpiredSessions({
      config: { runtimeMode: 'persistent' },
      storage,
      store,
    })).rejects.toThrow('oss unavailable')
    expect(store.purgeSession).not.toHaveBeenCalled()
  })
})
