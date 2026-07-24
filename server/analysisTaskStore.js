import { createHash, randomUUID } from 'node:crypto'

const TERMINAL_TASK_STATES = new Set(['success', 'fallback', 'error', 'cancelled', 'stale'])

function createAnalysisTaskStore(options = {}) {
  const sessions = new Map()
  const videos = new Map()
  const tasks = new Map()
  const now = options.now || (() => new Date().toISOString())
  const retentionHours = options.retentionHours || 24
  const requireReadyVideos = options.requireReadyVideos ?? false
  const createId = options.createId || ((prefix) => `${prefix}_${randomUUID()}`)
  const createToken = options.createToken || (() => randomUUID().replaceAll('-', ''))

  function createSession() {
    const id = createId('session')
    const token = createToken()
    const createdAt = now()
    const session = {
      id,
      tokenHash: hashToken(token),
      status: 'created',
      inputVersion: 0,
      activeTaskId: null,
      createdAt,
      updatedAt: createdAt,
      expiresAt: addHours(createdAt, retentionHours),
    }
    sessions.set(id, session)
    return { session: publicSession(session, sessionVideos(id, videos)), token }
  }

  function getSession(sessionId, token) {
    const session = authorizeSession(sessionId, token)
    return publicSession(session, sessionVideos(sessionId, videos))
  }

  function createVideoAsset(sessionId, token, input) {
    const session = authorizeSession(sessionId, token)
    for (const [videoId, video] of videos.entries()) {
      if (video.sessionId === sessionId && video.role === input.role) videos.delete(videoId)
    }

    const id = createId('video')
    const createdAt = now()
    const video = {
      id,
      sessionId,
      role: input.role,
      originalName: input.originalName,
      inputFormat: input.inputFormat,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      storageKey: input.storageKey,
      processedStorageKey: null,
      audioStorageKey: null,
      status: 'uploading',
      metadata: null,
      errorCode: null,
      createdAt,
      updatedAt: createdAt,
    }
    videos.set(id, video)
    touchSession(session)
    return publicVideo(video)
  }

  function getVideoAsset(videoId, token) {
    const video = requireVideo(videoId)
    authorizeSession(video.sessionId, token)
    return publicVideo(video)
  }

  function getVideoForProcessing(videoId) {
    return internalVideo(requireVideo(videoId))
  }

  function completeVideoUpload(videoId, token) {
    const video = requireVideo(videoId)
    authorizeSession(video.sessionId, token)
    return updateVideo(videoId, { status: 'uploaded', errorCode: null })
  }

  function updateVideo(videoId, updates) {
    const video = requireVideo(videoId)
    for (const key of ['status', 'processedStorageKey', 'audioStorageKey', 'metadata', 'errorCode']) {
      if (key in updates) video[key] = structuredCloneSafe(updates[key])
    }
    video.updatedAt = now()
    return publicVideo(video)
  }

  function deleteVideo(videoId, token) {
    const video = requireVideo(videoId)
    const session = authorizeSession(video.sessionId, token)
    markActiveTaskStale(session)
    videos.delete(videoId)
    touchSession(session)
    return internalVideo(video)
  }

  function createAnalysisTask(sessionId, token, inputVersion = 0, structuredAnalysis = null) {
    const session = authorizeSession(sessionId, token)
    if (requireReadyVideos) ensureVideosReady(sessionVideos(sessionId, videos))
    markActiveTaskStale(session)

    const taskId = createId('analysis')
    const createdAt = now()
    const task = {
      id: taskId,
      sessionId,
      inputVersion: Number.isInteger(inputVersion) ? inputVersion : 0,
      status: 'queued',
      stage: 'queued',
      structuredAnalysis: structuredCloneSafe(structuredAnalysis),
      report: null,
      errorCode: null,
      model: null,
      fallbackUsed: false,
      createdAt,
      updatedAt: createdAt,
      cancelledAt: null,
    }
    tasks.set(taskId, task)

    session.activeTaskId = taskId
    session.inputVersion = task.inputVersion
    session.status = 'analyzing'
    session.updatedAt = createdAt
    return publicTask(task)
  }

  function getAnalysisTask(taskId, token) {
    const task = requireTask(taskId)
    authorizeSession(task.sessionId, token)
    return publicTask(task)
  }

  function getAnalysisForProcessing(taskId) {
    return internalTask(requireTask(taskId))
  }

  function updateAnalysisTask(taskId, updates) {
    const task = requireTask(taskId)
    if (TERMINAL_TASK_STATES.has(task.status)) return publicTask(task)

    for (const key of ['status', 'stage', 'structuredAnalysis', 'report', 'errorCode', 'model', 'fallbackUsed']) {
      if (key in updates) task[key] = structuredCloneSafe(updates[key])
    }
    task.updatedAt = now()

    const session = sessions.get(task.sessionId)
    if (session && session.activeTaskId === taskId) {
      session.status = mapSessionStatus(task.status)
      session.updatedAt = task.updatedAt
      if (TERMINAL_TASK_STATES.has(task.status)) session.expiresAt = addHours(task.updatedAt, retentionHours)
    }
    return publicTask(task)
  }

  function cancelAnalysisTask(taskId, token) {
    const task = requireTask(taskId)
    const session = authorizeSession(task.sessionId, token)
    if (TERMINAL_TASK_STATES.has(task.status)) return publicTask(task)

    const cancelledAt = now()
    task.status = 'cancelled'
    task.stage = 'cancelled'
    task.cancelledAt = cancelledAt
    task.updatedAt = cancelledAt

    if (session.activeTaskId === taskId) {
      session.status = 'ready'
      session.updatedAt = cancelledAt
      session.expiresAt = addHours(cancelledAt, retentionHours)
    }
    return publicTask(task)
  }

  function deleteSession(sessionId, token) {
    authorizeSession(sessionId, token)
    purgeSession(sessionId)
    return { status: 'deleted' }
  }

  function listExpiredSessions(reference = new Date()) {
    const target = reference instanceof Date ? reference.getTime() : new Date(reference).getTime()
    return [...sessions.values()]
      .filter((session) => new Date(session.expiresAt).getTime() <= target)
      .map((session) => session.id)
  }

  function purgeSession(sessionId) {
    sessions.delete(sessionId)
    for (const [videoId, video] of videos.entries()) {
      if (video.sessionId === sessionId) videos.delete(videoId)
    }
    for (const [taskId, task] of tasks.entries()) {
      if (task.sessionId === sessionId) tasks.delete(taskId)
    }
  }

  function authorizeSession(sessionId, token) {
    const session = sessions.get(sessionId)
    if (!session) throw createServiceError('session_not_found', 404, '本次任务不存在或已删除')
    if (!token || hashToken(token) !== session.tokenHash) {
      throw createServiceError('session_token_invalid', 403, '本次任务访问凭证无效')
    }
    return session
  }

  function requireVideo(videoId) {
    const video = videos.get(videoId)
    if (!video) throw createServiceError('video_not_found', 404, '视频不存在')
    return video
  }

  function requireTask(taskId) {
    const task = tasks.get(taskId)
    if (!task) throw createServiceError('analysis_not_found', 404, '分析任务不存在')
    return task
  }

  function markActiveTaskStale(session) {
    if (!session.activeTaskId) return
    const activeTask = tasks.get(session.activeTaskId)
    if (!activeTask || TERMINAL_TASK_STATES.has(activeTask.status)) return
    activeTask.status = 'stale'
    activeTask.stage = 'stale'
    activeTask.updatedAt = now()
  }

  function touchSession(session) {
    session.updatedAt = now()
    session.expiresAt = addHours(session.updatedAt, retentionHours)
  }

  return {
    cancelAnalysisTask,
    close: async () => {},
    completeVideoUpload,
    createAnalysisTask,
    createSession,
    createVideoAsset,
    deleteSession,
    deleteVideo,
    getAnalysisForProcessing,
    getAnalysisTask,
    getSession,
    getVideoAsset,
    getVideoForProcessing,
    initialize: async () => {},
    listExpiredSessions,
    purgeSession,
    updateAnalysisTask,
    updateVideo,
  }
}

function ensureVideosReady(videos) {
  const byRole = new Map(videos.map((video) => [video.role, video.status]))
  if (byRole.get('teacher') !== 'ready' || byRole.get('user') !== 'ready') {
    throw createServiceError('videos_not_ready', 409, '两段视频尚未完成上传和转码')
  }
}

function sessionVideos(sessionId, videos) {
  return [...videos.values()]
    .filter((video) => video.sessionId === sessionId)
    .map(publicVideo)
}

function publicSession(session, videos = []) {
  return structuredClone({
    id: session.id,
    status: session.status,
    inputVersion: session.inputVersion,
    activeTaskId: session.activeTaskId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
    videos,
  })
}

function publicVideo(video) {
  return structuredClone({
    id: video.id,
    sessionId: video.sessionId,
    role: video.role,
    originalName: video.originalName,
    inputFormat: video.inputFormat,
    contentType: video.contentType,
    sizeBytes: video.sizeBytes,
    status: video.status,
    metadata: video.metadata,
    errorCode: video.errorCode,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
  })
}

function internalVideo(video) {
  return structuredClone({
    ...publicVideo(video),
    storageKey: video.storageKey,
    processedStorageKey: video.processedStorageKey,
    audioStorageKey: video.audioStorageKey,
  })
}

function publicTask(task) {
  return structuredClone({
    id: task.id,
    sessionId: task.sessionId,
    inputVersion: task.inputVersion,
    status: task.status,
    stage: task.stage,
    report: task.report,
    errorCode: task.errorCode,
    model: task.model,
    fallbackUsed: task.fallbackUsed,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    cancelledAt: task.cancelledAt,
  })
}

function internalTask(task) {
  return structuredClone({ ...publicTask(task), structuredAnalysis: task.structuredAnalysis })
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function mapSessionStatus(taskStatus) {
  if (taskStatus === 'success' || taskStatus === 'fallback' || taskStatus === 'cancelled') return 'ready'
  if (taskStatus === 'error') return 'error'
  return 'analyzing'
}

function addHours(value, hours) {
  return new Date(new Date(value).getTime() + hours * 60 * 60 * 1000).toISOString()
}

function structuredCloneSafe(value) {
  return value === undefined ? undefined : structuredClone(value)
}

function createServiceError(code, status, message) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

export {
  TERMINAL_TASK_STATES,
  createAnalysisTaskStore,
}
