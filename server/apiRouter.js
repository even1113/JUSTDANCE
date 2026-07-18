import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { assertValidStructuredAnalysis } from '../services/structuredAnalysisSchema.js'

const VIDEO_ROLES = new Set(['teacher', 'user'])
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime'])
const VIDEO_FORMATS = new Set(['mp4', 'mov'])

function createApiRouter({ config, queue, storage, store }) {
  return async function handleApiRequest(request, response) {
    const url = new URL(request.url || '/', 'http://localhost')
    if (!url.pathname.startsWith('/api/')) return false

    try {
      if (request.method === 'GET' && url.pathname === '/api/health/live') {
        sendJson(response, 200, { status: 'ok' })
        return true
      }
      if (request.method === 'GET' && url.pathname === '/api/health/ready') {
        await Promise.all([
          store.initialize(),
          storage.initialize(),
          queue.checkHealth?.(),
        ])
        sendJson(response, 200, { status: 'ready', runtimeMode: config.runtimeMode, storageDriver: storage.driver })
        return true
      }

      const token = readBearerToken(request)
      if (request.method === 'POST' && url.pathname === '/api/sessions') {
        sendJson(response, 201, await store.createSession())
        return true
      }

      const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/)
      if (sessionMatch && request.method === 'GET') {
        const session = await presentSession(await store.getSession(sessionMatch[1], token), store, storage)
        sendJson(response, 200, { session })
        return true
      }
      if (sessionMatch && request.method === 'DELETE') {
        const session = await store.getSession(sessionMatch[1], token)
        await cancelSessionJobs(session, queue)
        await storage.removePrefix(`sessions/${sessionMatch[1]}/`)
        const result = await store.deleteSession(sessionMatch[1], token)
        sendJson(response, 200, result)
        return true
      }

      const createVideoMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/videos$/)
      if (createVideoMatch && request.method === 'POST') {
        const sessionId = createVideoMatch[1]
        const body = validateCreateVideoBody(await readJsonBody(request), config)
        const session = await store.getSession(sessionId, token)
        const existing = session.videos.find((video) => video.role === body.role)
        if (existing) await deleteVideoAsset(existing.id, token, { queue, storage, store })

        const uploadId = randomUUID()
        const storageKey = `sessions/${sessionId}/uploads/${uploadId}.${body.inputFormat}`
        const video = await store.createVideoAsset(sessionId, token, { ...body, storageKey })
        const upload = await storage.createUploadTarget({
          contentType: body.contentType,
          key: storageKey,
          sizeBytes: body.sizeBytes,
        })
        sendJson(response, 201, { upload, video })
        return true
      }

      const completeVideoMatch = url.pathname.match(/^\/api\/videos\/([^/]+)\/complete$/)
      if (completeVideoMatch && request.method === 'POST') {
        const videoId = completeVideoMatch[1]
        await store.getVideoAsset(videoId, token)
        const internal = await store.getVideoForProcessing(videoId)
        if (internal.status !== 'uploading') {
          throw createRequestError('video_already_completed', 409, '视频上传已经确认，请等待处理完成')
        }
        const objectInfo = await storage.getObjectInfo(internal.storageKey)
        if (objectInfo.sizeBytes <= 0 || objectInfo.sizeBytes > config.media.maxVideoBytes) {
          throw createRequestError('upload_size_invalid', 422, '上传文件大小无效')
        }
        if (objectInfo.sizeBytes !== internal.sizeBytes) {
          throw createRequestError('upload_size_mismatch', 422, '上传文件大小与选择的文件不一致')
        }
        const video = await store.completeVideoUpload(videoId, token)
        await queue.enqueue({ type: 'media.prepare', videoId })
        sendJson(response, 202, { video })
        return true
      }

      const videoMatch = url.pathname.match(/^\/api\/videos\/([^/]+)$/)
      if (videoMatch && request.method === 'GET') {
        const video = await presentVideo(await store.getVideoAsset(videoMatch[1], token), store, storage)
        sendJson(response, 200, { video })
        return true
      }
      if (videoMatch && request.method === 'DELETE') {
        await deleteVideoAsset(videoMatch[1], token, { queue, storage, store })
        sendJson(response, 200, { status: 'deleted' })
        return true
      }

      const createAnalysisMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/analysis$/)
      if (createAnalysisMatch && request.method === 'POST') {
        const body = await readJsonBody(request)
        const structuredAnalysis = assertValidStructuredAnalysis(body.structuredAnalysis)
        const task = await store.createAnalysisTask(
          createAnalysisMatch[1],
          token,
          body.inputVersion,
          structuredAnalysis,
        )
        await queue.enqueue({
          inputVersion: task.inputVersion,
          taskId: task.id,
          type: 'analysis.generate',
        })
        sendJson(response, 202, { analysis: task })
        return true
      }

      const analysisMatch = url.pathname.match(/^\/api\/analysis\/([^/]+)$/)
      if (analysisMatch && request.method === 'GET') {
        sendJson(response, 200, { analysis: await store.getAnalysisTask(analysisMatch[1], token) })
        return true
      }
      if (analysisMatch && request.method === 'DELETE') {
        const analysis = await store.cancelAnalysisTask(analysisMatch[1], token)
        await queue.cancel(jobIdFor('analysis.generate', analysis.id, analysis.inputVersion))
        sendJson(response, 200, { analysis })
        return true
      }

      sendJson(response, 404, { error: { code: 'api_not_found', message: '接口不存在' } })
      return true
    } catch (error) {
      sendJson(response, error.status || 500, {
        error: {
          code: error.code || 'internal_error',
          message: error.status ? error.message : '服务暂时不可用',
        },
      })
      return true
    }
  }
}

async function presentSession(session, store, storage) {
  return {
    ...session,
    videos: await Promise.all(session.videos.map((video) => presentVideo(video, store, storage))),
  }
}

async function presentVideo(video, store, storage) {
  if (video.status !== 'ready') return video
  const internal = await store.getVideoForProcessing(video.id)
  return {
    ...video,
    playbackUrl: await storage.createReadUrl(internal.processedStorageKey),
  }
}

async function deleteVideoAsset(videoId, token, { queue, storage, store }) {
  await store.getVideoAsset(videoId, token)
  const internal = await store.getVideoForProcessing(videoId)
  const session = await store.getSession(internal.sessionId, token)
  await queue.cancel(jobIdFor('media.prepare', videoId))
  if (session.activeTaskId) {
    await queue.cancel(jobIdFor('analysis.generate', session.activeTaskId, session.inputVersion))
  }
  const keys = [internal.storageKey, internal.processedStorageKey, internal.audioStorageKey].filter(Boolean)
  await Promise.all(keys.map((key) => storage.removeObject(key)))
  await store.deleteVideo(videoId, token)
}

async function cancelSessionJobs(session, queue) {
  const cancellations = session.videos.map((video) => {
    return queue.cancel(jobIdFor('media.prepare', video.id))
  })
  if (session.activeTaskId) {
    cancellations.push(queue.cancel(jobIdFor(
      'analysis.generate',
      session.activeTaskId,
      session.inputVersion,
    )))
  }
  await Promise.all(cancellations)
}

function validateCreateVideoBody(body, config) {
  const role = String(body.role || '')
  const originalName = String(body.originalName || '').trim()
  const contentType = String(body.contentType || '').toLowerCase()
  const inputFormat = originalName.split('.').pop()?.toLowerCase() || ''
  const sizeBytes = Number(body.sizeBytes)
  if (!VIDEO_ROLES.has(role)) throw createRequestError('video_role_invalid', 422, '视频角色无效')
  if (!originalName || originalName.length > 255) throw createRequestError('video_name_invalid', 422, '视频文件名无效')
  if (!VIDEO_TYPES.has(contentType) && !VIDEO_FORMATS.has(inputFormat)) {
    throw createRequestError('invalid_format', 422, '仅支持 MP4 或 MOV 视频')
  }
  if (!VIDEO_FORMATS.has(inputFormat)) throw createRequestError('invalid_format', 422, '视频扩展名必须是 MP4 或 MOV')
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) throw createRequestError('video_size_invalid', 422, '视频文件大小无效')
  if (sizeBytes > config.media.maxVideoBytes) throw createRequestError('too_large', 413, '视频超过 500MB')
  return { contentType: contentType || `video/${inputFormat}`, inputFormat, originalName, role, sizeBytes }
}

function readBearerToken(request) {
  const authorization = request.headers.authorization || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
}

function readJsonBody(request, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(createRequestError('request_too_large', 413, '请求内容过大'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(createRequestError('invalid_json', 400, '请求内容不是有效 JSON'))
      }
    })
    request.on('error', reject)
  })
}

function jobIdFor(type, id, inputVersion = 0) {
  return `${type}__${id}__${inputVersion}`
}

function createRequestError(code, status, message) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

export {
  createApiRouter,
  jobIdFor,
  validateCreateVideoBody,
}
