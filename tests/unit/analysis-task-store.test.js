import { describe, expect, test } from 'vitest'
import { createAnalysisTaskStore } from '../../server/analysisTaskStore.js'

function createStore() {
  let id = 0
  let time = 0
  return createAnalysisTaskStore({
    createId: (prefix) => `${prefix}_${++id}`,
    createToken: () => 'session-token',
    now: () => `2026-07-18T00:00:${String(time++).padStart(2, '0')}.000Z`,
  })
}

describe('controlled analysis task store', () => {
  test('creates an anonymous session without exposing the stored token hash', () => {
    const store = createStore()
    const { session, token } = store.createSession()

    expect(token).toBe('session-token')
    expect(session).not.toHaveProperty('tokenHash')
    expect(store.getSession(session.id, token).status).toBe('created')
  })

  test('marks the previous in-flight task stale when a new analysis starts', () => {
    const store = createStore()
    const { session, token } = store.createSession()
    const first = store.createAnalysisTask(session.id, token, 1)
    store.createAnalysisTask(session.id, token, 2)

    expect(store.getAnalysisTask(first.id, token).status).toBe('stale')
  })

  test('ignores late provider results after cancellation', () => {
    const store = createStore()
    const { session, token } = store.createSession()
    const task = store.createAnalysisTask(session.id, token, 1)

    store.cancelAnalysisTask(task.id, token)
    store.updateAnalysisTask(task.id, { status: 'success', report: { unsafe: true } })

    const cancelled = store.getAnalysisTask(task.id, token)
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.report).toBeNull()
  })

  test('requires the session token for reads and deletion', () => {
    const store = createStore()
    const { session } = store.createSession()

    expect(() => store.getSession(session.id, 'wrong-token')).toThrowError(expect.objectContaining({
      code: 'session_token_invalid',
    }))
  })
})
