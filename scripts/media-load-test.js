import { openAsBlob } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'

const options = parseArguments(process.argv.slice(2))
const teacherPath = requirePath(options.teacher, '--teacher')
const userPath = requirePath(options.user, '--user')
const baseUrl = String(options['base-url'] || 'http://127.0.0.1:5173').replace(/\/$/, '')
const runs = readPositiveInteger(options.runs, 3, '--runs')
const concurrency = readPositiveInteger(options.concurrency, 1, '--concurrency')

const queue = Array.from({ length: runs }, (_, index) => index + 1)
const results = []
await Promise.all(Array.from({ length: Math.min(concurrency, runs) }, runWorker))

const successful = results.filter((result) => result.status === 'success')
const durations = successful.map((result) => result.durationMs).sort((a, b) => a - b)
const output = {
  baseUrl,
  runs,
  concurrency,
  succeeded: successful.length,
  failed: results.length - successful.length,
  durationMs: durations.length > 0
    ? {
        min: durations[0],
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        max: durations.at(-1),
      }
    : null,
  results,
}

console.log(JSON.stringify(output, null, 2))
if (successful.length !== runs) process.exitCode = 1

async function runWorker() {
  while (queue.length > 0) {
    const run = queue.shift()
    if (!run) return
    const startedAt = Date.now()
    let session
    try {
      session = await createSession()
      await Promise.all([
        uploadVideo(session, 'teacher', teacherPath),
        uploadVideo(session, 'user', userPath),
      ])
      await waitForVideosReady(session)
      results.push({ run, status: 'success', durationMs: Date.now() - startedAt })
    } catch (error) {
      results.push({
        run,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        errorCode: error.code || error.message,
      })
    } finally {
      if (session) await deleteSession(session).catch(() => {})
    }
  }
}

async function createSession() {
  const body = await request('/api/sessions', { method: 'POST' })
  return { id: body.session.id, token: body.token }
}

async function uploadVideo(session, role, filePath) {
  const fileStat = await stat(filePath)
  const fileName = basename(filePath)
  const contentType = extname(filePath).toLowerCase() === '.mov' ? 'video/quicktime' : 'video/mp4'
  const initiated = await request(`/api/sessions/${session.id}/videos`, {
    method: 'POST',
    token: session.token,
    json: {
      role,
      originalName: fileName,
      contentType,
      sizeBytes: fileStat.size,
    },
  })
  const blob = await openAsBlob(filePath, { type: contentType })
  const uploadUrl = new URL(initiated.upload.url, `${baseUrl}/`).toString()
  let response
  try {
    response = await fetch(uploadUrl, {
      method: initiated.upload.method || 'PUT',
      headers: initiated.upload.headers,
      body: blob,
    })
  } catch (error) {
    throw createError(`load_test_${role}_transport_${error.cause?.code || error.code || 'failed'}`)
  }
  if (!response.ok) throw createError('load_test_upload_failed')
  await request(`/api/videos/${initiated.video.id}/complete`, {
    method: 'POST',
    token: session.token,
    json: {},
  })
}

async function waitForVideosReady(session) {
  const deadline = Date.now() + 30 * 60 * 1000
  while (Date.now() < deadline) {
    const body = await request(`/api/sessions/${session.id}`, { token: session.token })
    if (body.session.videos.some((video) => video.status === 'error')) {
      const failed = body.session.videos.find((video) => video.status === 'error')
      throw createError(failed.errorCode || 'media_processing_failed')
    }
    const readyRoles = new Set(
      body.session.videos.filter((video) => video.status === 'ready').map((video) => video.role),
    )
    if (readyRoles.has('teacher') && readyRoles.has('user')) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw createError('load_test_timeout')
}

async function deleteSession(session) {
  await request(`/api/sessions/${session.id}`, { method: 'DELETE', token: session.token })
}

async function request(path, options = {}) {
  const headers = {}
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  if (options.json !== undefined) headers['Content-Type'] = 'application/json'
  let response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.json === undefined ? undefined : JSON.stringify(options.json),
    })
  } catch (error) {
    throw createError([
      'load_test_request_transport',
      options.method || 'GET',
      routeLabel(path),
      error.cause?.code || error.code || 'failed',
    ].join('_'))
  }
  const body = await response.json()
  if (!response.ok) throw createError(body.error?.code || `http_${response.status}`)
  return body
}

function routeLabel(path) {
  if (path === '/api/sessions') return 'sessions'
  if (path.startsWith('/api/sessions/')) return path.endsWith('/videos') ? 'session_videos' : 'session'
  if (path.startsWith('/api/videos/')) return 'video_complete'
  return 'api'
}

function parseArguments(args) {
  const parsed = {}
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.replace(/^--/, '')
    const value = args[index + 1]
    if (!key || value === undefined) throw createError(`invalid_argument_${args[index] || 'unknown'}`)
    parsed[key] = value
  }
  return parsed
}

function requirePath(value, name) {
  if (!value) throw createError(`missing_${name.replace('--', '')}`)
  return resolve(value)
}

function readPositiveInteger(value, fallback, name) {
  const parsed = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw createError(`invalid_${name.replace('--', '')}`)
  }
  return parsed
}

function percentile(values, ratio) {
  return values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)]
}

function createError(code) {
  const error = new Error(code)
  error.code = code
  return error
}
