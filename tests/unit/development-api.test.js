import { afterEach, describe, expect, test } from 'vitest'
import { createStructuredAnalysisFixture } from '../fixtures/structured-analysis.js'
import { seedReadyVideos, startTestServer } from '../helpers/test-server.js'

const servers = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()))
})

describe('development analysis API', () => {
  test('runs create, analyze, query, and delete through the controlled API', async () => {
    const testServer = await startTestServer()
    const { origin, runtime } = testServer
    servers.push(testServer)

    const createResponse = await fetch(`${origin}/api/sessions`, { method: 'POST' })
    const created = await createResponse.json()
    const authorization = { Authorization: `Bearer ${created.token}` }

    expect(createResponse.status).toBe(201)
    expect(created.session.status).toBe('created')
    await seedReadyVideos(runtime, created.session.id, created.token)

    const analysisResponse = await fetch(`${origin}/api/sessions/${created.session.id}/analysis`, {
      method: 'POST',
      headers: { ...authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputVersion: 1,
        structuredAnalysis: createStructuredAnalysisFixture(),
      }),
    })
    const started = await analysisResponse.json()

    expect(analysisResponse.status).toBe(202)
    expect(started.analysis.status).toBe('queued')

    const completed = await waitForAnalysis(origin, started.analysis.id, authorization)
    expect(completed.status).toBe('fallback')
    expect(completed.report.schemaVersion).toBe('1.0')
    expect(completed.errorCode).toBe('model_not_configured')

    const deleteResponse = await fetch(`${origin}/api/sessions/${created.session.id}`, {
      method: 'DELETE',
      headers: authorization,
    })
    expect(await deleteResponse.json()).toEqual({ status: 'deleted' })

    const missingResponse = await fetch(`${origin}/api/sessions/${created.session.id}`, {
      headers: authorization,
    })
    expect(missingResponse.status).toBe(404)
  })

  test('rejects access with the wrong task token', async () => {
    const testServer = await startTestServer()
    const { origin } = testServer
    servers.push(testServer)
    const created = await (await fetch(`${origin}/api/sessions`, { method: 'POST' })).json()

    const response = await fetch(`${origin}/api/sessions/${created.session.id}`, {
      headers: { Authorization: 'Bearer wrong-token' },
    })
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error.code).toBe('session_token_invalid')
  })

  test('returns same-origin upload targets and replaces a failed role upload cleanly', async () => {
    const testServer = await startTestServer()
    const { origin } = testServer
    servers.push(testServer)
    const created = await (await fetch(`${origin}/api/sessions`, { method: 'POST' })).json()
    const headers = {
      Authorization: `Bearer ${created.token}`,
      'Content-Type': 'application/json',
    }
    const createVideo = (role) => fetch(`${origin}/api/sessions/${created.session.id}/videos`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        role,
        originalName: `${role}.mp4`,
        contentType: 'video/mp4',
        sizeBytes: 1024,
      }),
    }).then((response) => response.json())

    const firstTeacher = await createVideo('teacher')
    const retriedTeacher = await createVideo('teacher')
    const user = await createVideo('user')

    expect(firstTeacher.upload.url).toMatch(/^\/api\/storage\/upload\//)
    expect(firstTeacher.upload.url).not.toContain('localhost')
    expect(retriedTeacher.video.id).not.toBe(firstTeacher.video.id)
    expect(user.upload.url).toMatch(/^\/api\/storage\/upload\//)

    const session = await (await fetch(`${origin}/api/sessions/${created.session.id}`, {
      headers: { Authorization: `Bearer ${created.token}` },
    })).json()
    expect(session.session.videos).toHaveLength(2)
    expect(session.session.videos.find((video) => video.role === 'teacher').id).toBe(retriedTeacher.video.id)
  })
})

async function waitForAnalysis(origin, taskId, headers) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${origin}/api/analysis/${taskId}`, { headers })
    const body = await response.json()
    if (['success', 'fallback'].includes(body.analysis.status)) return body.analysis
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('analysis did not complete')
}
