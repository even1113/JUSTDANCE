import { assertValidReport } from './reportSchema.js'

const TERMINAL_ANALYSIS_STATES = new Set(['success', 'fallback', 'error', 'cancelled', 'stale'])

function createComparisonApiClient(options = {}) {
  const baseUrl = String(options.baseUrl || '').replace(/\/$/, '')
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const uploadImpl = options.uploadImpl || uploadWithProgress
  const pollIntervalMs = options.pollIntervalMs ?? 250
  const maxWaitMs = options.maxWaitMs ?? 10 * 60 * 1000
  const mediaMaxWaitMs = options.mediaMaxWaitMs ?? 20 * 60 * 1000

  if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持网络请求')

  async function createSession({ signal } = {}) {
    const body = await request('/api/sessions', { method: 'POST', signal })
    return {
      sessionId: body.session.id,
      session: body.session,
      token: body.token,
    }
  }

  async function getSession(sessionId, token, { signal } = {}) {
    const body = await request(`/api/sessions/${encodeURIComponent(sessionId)}`, { token, signal })
    return body.session
  }

  async function uploadVideo({ sessionId, token, role, file, signal, onProgress = () => {} }) {
    onProgress({ stage: 'initializing', loaded: 0, total: file.size })
    const initiated = await request(`/api/sessions/${encodeURIComponent(sessionId)}/videos`, {
      method: 'POST',
      token,
      signal,
      json: {
        role,
        originalName: file.name,
        contentType: file.type || contentTypeFromName(file.name),
        sizeBytes: file.size,
      },
    })

    await uploadImpl(initiated.upload, file, {
      signal,
      onProgress(loaded, total) {
        onProgress({ stage: 'uploading', loaded, total })
      },
    })
    onProgress({ stage: 'uploaded', loaded: file.size, total: file.size })
    const completed = await request(`/api/videos/${encodeURIComponent(initiated.video.id)}/complete`, {
      method: 'POST',
      token,
      signal,
      json: {},
    })
    onProgress({ stage: completed.video.status, loaded: file.size, total: file.size })
    return waitForVideo({
      onProgress,
      sessionId,
      signal,
      token,
      videoId: initiated.video.id,
    })
  }

  async function waitForVideo({ sessionId, token, videoId, signal, onProgress }) {
    const startedAt = Date.now()
    while (Date.now() - startedAt <= mediaMaxWaitMs) {
      throwIfAborted(signal)
      const session = await getSession(sessionId, token, { signal })
      const video = session.videos.find((item) => item.id === videoId)
      if (!video) throw createRequestError('video_not_found', '上传的视频已经被删除')
      onProgress({ stage: video.status, video })
      if (video.status === 'ready') return video
      if (video.status === 'error') throw createVideoError(video)
      await wait(pollIntervalMs, signal)
    }
    throw createRequestError('video_processing_timeout', '视频处理等待超时，请稍后重试。')
  }

  async function deleteVideo(videoId, token, { signal } = {}) {
    return request(`/api/videos/${encodeURIComponent(videoId)}`, {
      method: 'DELETE',
      token,
      signal,
    })
  }

  async function startAnalysis({
    sessionId,
    token,
    inputVersion,
    sharedDurationSec,
    structuredAnalysis,
    signal,
    onTaskCreated = () => {},
    onStatus = () => {},
  }) {
    const body = await request(`/api/sessions/${encodeURIComponent(sessionId)}/analysis`, {
      method: 'POST',
      token,
      signal,
      json: { inputVersion, structuredAnalysis },
    })
    const taskId = body.analysis.id
    onTaskCreated(body.analysis)
    onStatus(body.analysis)

    const analysis = await waitForAnalysis({ taskId, token, signal, onStatus })
    if (analysis.status === 'success' || analysis.status === 'fallback') {
      const report = assertValidReport(analysis.report, { sharedDurationSec })
      return { ...report, fallback: analysis.status === 'fallback' }
    }

    throw createAnalysisError(analysis)
  }

  async function getAnalysis(taskId, token, { signal } = {}) {
    const body = await request(`/api/analysis/${encodeURIComponent(taskId)}`, {
      token,
      signal,
    })
    return body.analysis
  }

  async function cancelAnalysis(taskId, token, { signal } = {}) {
    const body = await request(`/api/analysis/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
      token,
      signal,
    })
    return body.analysis
  }

  async function deleteSession(sessionId, token, { signal } = {}) {
    return request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      token,
      signal,
    })
  }

  async function waitForAnalysis({ taskId, token, signal, onStatus }) {
    const startedAt = Date.now()

    while (Date.now() - startedAt <= maxWaitMs) {
      throwIfAborted(signal)
      const analysis = await getAnalysis(taskId, token, { signal })
      onStatus(analysis)
      if (TERMINAL_ANALYSIS_STATES.has(analysis.status)) return analysis
      await wait(pollIntervalMs, signal)
    }

    const error = new Error('动作分析等待超时，请稍后重试。')
    error.code = 'analysis_timeout'
    throw error
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) }
    if (options.token) headers.Authorization = `Bearer ${options.token}`
    if (options.json !== undefined) headers['Content-Type'] = 'application/json'

    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.json === undefined ? undefined : JSON.stringify(options.json),
      signal: options.signal,
    })
    const body = await readResponseBody(response)
    if (!response.ok) {
      const error = new Error(body.error?.message || '服务暂时不可用')
      error.code = body.error?.code || 'request_failed'
      error.status = response.status
      throw error
    }
    return body
  }

  return {
    cancelAnalysis,
    createSession,
    deleteVideo,
    deleteSession,
    getAnalysis,
    getSession,
    startAnalysis,
    uploadVideo,
  }
}

function uploadWithProgress(target, file, options = {}) {
  if (typeof XMLHttpRequest === 'undefined') {
    return fetch(target.url, {
      method: target.method || 'PUT',
      headers: target.headers,
      body: file,
      signal: options.signal,
    }).then((response) => {
      if (!response.ok) throw createRequestError('upload_failed', '视频上传失败，请检查网络后重试。')
      options.onProgress?.(file.size, file.size)
    })
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(target.method || 'PUT', target.url)
    Object.entries(target.headers || {}).forEach(([name, value]) => xhr.setRequestHeader(name, value))
    xhr.upload.addEventListener('progress', (event) => {
      options.onProgress?.(event.loaded, event.lengthComputable ? event.total : file.size)
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(createRequestError('upload_failed', '视频上传失败，请检查网络后重试。'))
    })
    xhr.addEventListener('error', () => reject(createRequestError('upload_failed', '视频上传失败，请检查网络后重试。')))
    xhr.addEventListener('abort', () => {
      const error = createRequestError('upload_cancelled', '视频上传已取消')
      error.name = 'AbortError'
      reject(error)
    })
    const abort = () => xhr.abort()
    if (options.signal?.aborted) abort()
    else options.signal?.addEventListener('abort', abort, { once: true })
    xhr.addEventListener('loadend', () => options.signal?.removeEventListener('abort', abort), { once: true })
    xhr.send(file)
  })
}

async function readResponseBody(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    const error = new Error('服务返回了无法识别的数据')
    error.code = 'invalid_response'
    throw error
  }
}

function createAnalysisError(analysis) {
  const messages = {
    cancelled: '本次分析已取消',
    stale: '视频已经变化，本次旧分析结果已失效',
    error: '动作分析没有完成，请稍后重试。',
  }
  const error = new Error(messages[analysis.status] || '动作分析没有完成')
  error.code = analysis.errorCode || `analysis_${analysis.status}`
  if (analysis.status === 'cancelled') error.name = 'AbortError'
  return error
}

function createVideoError(video) {
  const messages = {
    decode_failed: '服务端无法读取这段视频，请重新选择。',
    invalid_format: '服务端检测到文件不是有效的 MP4 或 MOV。',
    media_process_failed: '视频统一格式失败，请重新选择或换一段视频。',
    teacher_audio_missing: '老师视频需要包含清晰的背景音乐。',
    too_large: '视频超过 500MB。',
    too_long: '视频超过 3 分钟，请截取后重新选择。',
    transcode_output_invalid: '视频统一格式失败，请换一段视频。',
  }
  return createRequestError(video.errorCode || 'video_processing_failed', messages[video.errorCode] || '视频处理失败，请重新选择。')
}

function createRequestError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function contentTypeFromName(name) {
  return String(name).toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4'
}

function wait(duration, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort)
    const finish = () => {
      cleanup()
      resolve()
    }
    const abort = () => {
      clearTimeout(timer)
      cleanup()
      reject(createAbortError())
    }
    const timer = setTimeout(finish, duration)

    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError()
}

function createAbortError() {
  const error = new Error('任务已取消')
  error.name = 'AbortError'
  return error
}

export {
  TERMINAL_ANALYSIS_STATES,
  createComparisonApiClient,
  uploadWithProgress,
  wait,
}
