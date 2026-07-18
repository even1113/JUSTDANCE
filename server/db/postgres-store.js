import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'

const TERMINAL_TASK_STATES = new Set(['success', 'fallback', 'error', 'cancelled', 'stale'])

function createPostgresStore(options) {
  const pool = options.pool || new pg.Pool({ connectionString: options.databaseUrl })
  const ownsPool = !options.pool
  const retentionHours = options.retentionHours || 24
  const createId = options.createId || ((prefix) => `${prefix}_${randomUUID()}`)
  const createToken = options.createToken || (() => randomUUID().replaceAll('-', ''))

  async function initialize() {
    await pool.query('SELECT 1')
  }

  async function close() {
    if (ownsPool) await pool.end()
  }

  async function createSession() {
    const id = createId('session')
    const token = createToken()
    const now = new Date()
    const expiresAt = addHours(now, retentionHours)
    const result = await pool.query(
      `INSERT INTO sessions
        (id, token_hash, status, input_version, active_task_id, created_at, updated_at, expires_at)
       VALUES ($1, $2, 'created', 0, NULL, $3, $3, $4)
       RETURNING *`,
      [id, hashToken(token), now, expiresAt],
    )
    return { session: await publicSessionWithVideos(result.rows[0]), token }
  }

  async function getSession(sessionId, token) {
    const session = await authorizeSession(sessionId, token)
    return publicSessionWithVideos(session)
  }

  async function createVideoAsset(sessionId, token, input) {
    const session = await authorizeSession(sessionId, token)
    const id = createId('video')
    const now = new Date()
    const result = await pool.query(
      `INSERT INTO video_assets
        (id, session_id, role, original_name, input_format, content_type, size_bytes, storage_key, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'uploading', $9, $9)
       ON CONFLICT (session_id, role) DO UPDATE SET
         id = EXCLUDED.id,
         original_name = EXCLUDED.original_name,
         input_format = EXCLUDED.input_format,
         content_type = EXCLUDED.content_type,
         size_bytes = EXCLUDED.size_bytes,
         storage_key = EXCLUDED.storage_key,
         processed_storage_key = NULL,
         audio_storage_key = NULL,
         status = 'uploading',
         metadata = NULL,
         error_code = NULL,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [id, session.id, input.role, input.originalName, input.inputFormat, input.contentType, input.sizeBytes, input.storageKey, now],
    )
    await touchSession(session.id, now)
    return publicVideo(result.rows[0])
  }

  async function getVideoAsset(videoId, token) {
    const video = await requireVideo(videoId)
    await authorizeSession(video.session_id, token)
    return publicVideo(video)
  }

  async function getVideoForProcessing(videoId) {
    return internalVideo(await requireVideo(videoId))
  }

  async function completeVideoUpload(videoId, token) {
    const video = await requireVideo(videoId)
    await authorizeSession(video.session_id, token)
    return updateVideo(videoId, { status: 'uploaded', errorCode: null })
  }

  async function updateVideo(videoId, updates) {
    const assignments = []
    const values = []
    const allowed = {
      status: 'status',
      processedStorageKey: 'processed_storage_key',
      audioStorageKey: 'audio_storage_key',
      metadata: 'metadata',
      errorCode: 'error_code',
    }
    for (const [key, column] of Object.entries(allowed)) {
      if (!(key in updates)) continue
      values.push(key === 'metadata' ? JSON.stringify(updates[key]) : updates[key])
      assignments.push(`${column} = $${values.length}`)
    }
    if (assignments.length === 0) return publicVideo(await requireVideo(videoId))
    values.push(new Date())
    assignments.push(`updated_at = $${values.length}`)
    values.push(videoId)
    const result = await pool.query(
      `UPDATE video_assets SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    )
    if (result.rowCount === 0) throw createServiceError('video_not_found', 404, '视频不存在')
    return publicVideo(result.rows[0])
  }

  async function deleteVideo(videoId, token) {
    const video = await requireVideo(videoId)
    const session = await authorizeSession(video.session_id, token)
    await markActiveTaskStale(session)
    await pool.query('DELETE FROM video_assets WHERE id = $1', [videoId])
    await touchSession(session.id, new Date())
    return internalVideo(video)
  }

  async function createAnalysisTask(sessionId, token, inputVersion = 0, structuredAnalysis = null) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const session = await authorizeSession(sessionId, token, client, { lock: true })
      const videos = await client.query('SELECT role, status FROM video_assets WHERE session_id = $1', [sessionId])
      ensureVideosReady(videos.rows)
      await markActiveTaskStale(session, client)

      const id = createId('analysis')
      const now = new Date()
      const result = await client.query(
        `INSERT INTO analysis_tasks
          (id, session_id, input_version, status, stage, structured_analysis, created_at, updated_at)
         VALUES ($1, $2, $3, 'queued', 'queued', $4, $5, $5)
         RETURNING *`,
        [id, sessionId, Number.isInteger(inputVersion) ? inputVersion : 0, JSON.stringify(structuredAnalysis), now],
      )
      await client.query(
        `UPDATE sessions SET active_task_id = $1, input_version = $2, status = 'analyzing', updated_at = $3 WHERE id = $4`,
        [id, result.rows[0].input_version, now, sessionId],
      )
      await client.query('COMMIT')
      return publicTask(result.rows[0])
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async function getAnalysisTask(taskId, token) {
    const task = await requireTask(taskId)
    await authorizeSession(task.session_id, token)
    return publicTask(task)
  }

  async function getAnalysisForProcessing(taskId) {
    return internalTask(await requireTask(taskId))
  }

  async function updateAnalysisTask(taskId, updates) {
    const task = await requireTask(taskId)
    if (TERMINAL_TASK_STATES.has(task.status)) return publicTask(task)

    const assignments = []
    const values = []
    const allowed = {
      status: 'status',
      stage: 'stage',
      structuredAnalysis: 'structured_analysis',
      report: 'report',
      errorCode: 'error_code',
      model: 'model',
      fallbackUsed: 'fallback_used',
    }
    for (const [key, column] of Object.entries(allowed)) {
      if (!(key in updates)) continue
      const value = ['structuredAnalysis', 'report'].includes(key) ? JSON.stringify(updates[key]) : updates[key]
      values.push(value)
      assignments.push(`${column} = $${values.length}`)
    }
    const now = new Date()
    values.push(now)
    assignments.push(`updated_at = $${values.length}`)
    values.push(taskId)
    const result = await pool.query(
      `UPDATE analysis_tasks SET ${assignments.join(', ')}
       WHERE id = $${values.length} AND status NOT IN ('success', 'fallback', 'error', 'cancelled', 'stale')
       RETURNING *`,
      values,
    )
    if (result.rowCount === 0) return publicTask(await requireTask(taskId))

    const updated = result.rows[0]
    await updateSessionFromTask(updated, now)
    return publicTask(updated)
  }

  async function cancelAnalysisTask(taskId, token) {
    const task = await requireTask(taskId)
    const session = await authorizeSession(task.session_id, token)
    if (TERMINAL_TASK_STATES.has(task.status)) return publicTask(task)
    const now = new Date()
    const result = await pool.query(
      `UPDATE analysis_tasks
       SET status = 'cancelled', stage = 'cancelled', cancelled_at = $1, updated_at = $1
       WHERE id = $2 RETURNING *`,
      [now, taskId],
    )
    if (session.active_task_id === taskId) {
      await pool.query(
        `UPDATE sessions SET status = 'ready', updated_at = $1, expires_at = $2 WHERE id = $3`,
        [now, addHours(now, retentionHours), session.id],
      )
    }
    return publicTask(result.rows[0])
  }

  async function deleteSession(sessionId, token) {
    await authorizeSession(sessionId, token)
    await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId])
    return { status: 'deleted' }
  }

  async function listExpiredSessions(now = new Date()) {
    const result = await pool.query('SELECT id FROM sessions WHERE expires_at <= $1 ORDER BY expires_at ASC LIMIT 500', [now])
    return result.rows.map((row) => row.id)
  }

  async function purgeSession(sessionId) {
    await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId])
  }

  async function authorizeSession(sessionId, token, queryable = pool, options = {}) {
    const suffix = options.lock ? ' FOR UPDATE' : ''
    const result = await queryable.query(`SELECT * FROM sessions WHERE id = $1${suffix}`, [sessionId])
    const session = result.rows[0]
    if (!session) throw createServiceError('session_not_found', 404, '本次任务不存在或已删除')
    if (!token || hashToken(token) !== session.token_hash) {
      throw createServiceError('session_token_invalid', 403, '本次任务访问凭证无效')
    }
    return session
  }

  async function requireVideo(videoId) {
    const result = await pool.query('SELECT * FROM video_assets WHERE id = $1', [videoId])
    if (result.rowCount === 0) throw createServiceError('video_not_found', 404, '视频不存在')
    return result.rows[0]
  }

  async function requireTask(taskId) {
    const result = await pool.query('SELECT * FROM analysis_tasks WHERE id = $1', [taskId])
    if (result.rowCount === 0) throw createServiceError('analysis_not_found', 404, '分析任务不存在')
    return result.rows[0]
  }

  async function markActiveTaskStale(session, queryable = pool) {
    if (!session.active_task_id) return
    await queryable.query(
      `UPDATE analysis_tasks SET status = 'stale', stage = 'stale', updated_at = $1
       WHERE id = $2 AND status NOT IN ('success', 'fallback', 'error', 'cancelled', 'stale')`,
      [new Date(), session.active_task_id],
    )
  }

  async function updateSessionFromTask(task, now) {
    const sessionStatus = mapSessionStatus(task.status)
    const expiresAt = TERMINAL_TASK_STATES.has(task.status) ? addHours(now, retentionHours) : null
    await pool.query(
      `UPDATE sessions SET status = $1, updated_at = $2,
       expires_at = COALESCE($3, expires_at) WHERE id = $4 AND active_task_id = $5`,
      [sessionStatus, now, expiresAt, task.session_id, task.id],
    )
  }

  async function touchSession(sessionId, now) {
    await pool.query(
      'UPDATE sessions SET updated_at = $1, expires_at = $2 WHERE id = $3',
      [now, addHours(now, retentionHours), sessionId],
    )
  }

  async function publicSessionWithVideos(session) {
    const videos = await pool.query('SELECT * FROM video_assets WHERE session_id = $1 ORDER BY role', [session.id])
    return publicSession(session, videos.rows.map(publicVideo))
  }

  return {
    cancelAnalysisTask,
    close,
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
    initialize,
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

function publicSession(session, videos = []) {
  return {
    id: session.id,
    status: session.status,
    inputVersion: session.input_version,
    activeTaskId: session.active_task_id,
    createdAt: toIso(session.created_at),
    updatedAt: toIso(session.updated_at),
    expiresAt: toIso(session.expires_at),
    videos,
  }
}

function publicVideo(video) {
  return {
    id: video.id,
    sessionId: video.session_id,
    role: video.role,
    originalName: video.original_name,
    inputFormat: video.input_format,
    contentType: video.content_type,
    sizeBytes: Number(video.size_bytes),
    status: video.status,
    metadata: video.metadata || null,
    errorCode: video.error_code,
    createdAt: toIso(video.created_at),
    updatedAt: toIso(video.updated_at),
  }
}

function internalVideo(video) {
  return {
    ...publicVideo(video),
    storageKey: video.storage_key,
    processedStorageKey: video.processed_storage_key,
    audioStorageKey: video.audio_storage_key,
  }
}

function publicTask(task) {
  return {
    id: task.id,
    sessionId: task.session_id,
    inputVersion: task.input_version,
    status: task.status,
    stage: task.stage,
    report: task.report || null,
    errorCode: task.error_code,
    model: task.model,
    fallbackUsed: Boolean(task.fallback_used),
    createdAt: toIso(task.created_at),
    updatedAt: toIso(task.updated_at),
    cancelledAt: toIso(task.cancelled_at),
  }
}

function internalTask(task) {
  return { ...publicTask(task), structuredAnalysis: task.structured_analysis || null }
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function mapSessionStatus(taskStatus) {
  if (taskStatus === 'success' || taskStatus === 'fallback' || taskStatus === 'cancelled') return 'ready'
  if (taskStatus === 'error') return 'error'
  return 'analyzing'
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

function toIso(value) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function createServiceError(code, status, message) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

export {
  TERMINAL_TASK_STATES,
  createPostgresStore,
}
