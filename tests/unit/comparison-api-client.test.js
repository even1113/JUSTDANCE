import { afterEach, describe, expect, test } from 'vitest'
import { createComparisonApiClient } from '../../services/comparisonApiClient.js'
import { createStructuredAnalysisFixture } from '../fixtures/structured-analysis.js'
import { seedReadyVideos, startTestServer } from '../helpers/test-server.js'

const servers = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()))
})

describe('comparison API client', () => {
  test('creates a session, polls analysis, and validates the report', async () => {
    const testServer = await startTestServer()
    const { origin, runtime } = testServer
    servers.push(testServer)
    const client = createComparisonApiClient({ baseUrl: origin, pollIntervalMs: 10 })
    const session = await client.createSession()
    await seedReadyVideos(runtime, session.sessionId, session.token)
    const statuses = []

    const report = await client.startAnalysis({
      sessionId: session.sessionId,
      token: session.token,
      inputVersion: 1,
      sharedDurationSec: 12,
      structuredAnalysis: createStructuredAnalysisFixture(),
      onStatus: (analysis) => statuses.push(analysis.status),
    })

    expect(report.schemaVersion).toBe('1.0')
    expect(report.fallback).toBe(true)
    expect(statuses).toContain('queued')
    expect(statuses.at(-1)).toBe('fallback')
  })

  test('cancels a task using the task-scoped session token', async () => {
    const testServer = await startTestServer({ modelClient: createSlowModelClient() })
    const { origin, runtime } = testServer
    servers.push(testServer)
    const client = createComparisonApiClient({ baseUrl: origin })
    const session = await client.createSession()
    await seedReadyVideos(runtime, session.sessionId, session.token)
    let taskId = null
    const controller = new AbortController()

    const analysisPromise = client.startAnalysis({
      sessionId: session.sessionId,
      token: session.token,
      inputVersion: 1,
      structuredAnalysis: createStructuredAnalysisFixture(),
      signal: controller.signal,
      onTaskCreated: (task) => {
        taskId = task.id
        controller.abort()
      },
    })

    await expect(analysisPromise).rejects.toMatchObject({ name: 'AbortError' })
    const cancelled = await client.cancelAnalysis(taskId, session.token)
    expect(cancelled.status).toBe('cancelled')
  })
})

function createSlowModelClient() {
  return {
    generateReport({ signal }) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 5000)
        signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          const error = new Error('cancelled')
          error.name = 'AbortError'
          reject(error)
        }, { once: true })
      })
    },
  }
}
