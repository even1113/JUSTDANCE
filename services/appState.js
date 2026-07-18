const APP_STAGES = [
  'upload',
  'processing',
  'subject-selection',
  'manual-alignment',
  'ready',
  'analyzing',
  'report',
  'blocking-error',
]

const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime'])
const ALLOWED_VIDEO_EXTENSIONS = new Set(['mp4', 'mov'])
const MAX_VIDEO_BYTES = 500 * 1024 * 1024
const MAX_VIDEO_DURATION_SEC = 180

function createInitialAppState() {
  return {
    stage: 'upload',
    sessionId: null,
    sessionToken: null,
    analysisTaskId: null,
    poseAnalysis: null,
    taskVersion: 0,
    scenario: 'standard',
    videos: { teacher: null, user: null },
    processingSteps: [],
    subjectSelections: { teacher: null, user: null },
    subjectStep: 'teacher',
    alignment: null,
    manualAnchors: { teacher: null, user: null },
    report: null,
    activeMismatchIndex: -1,
    commonTime: 0,
    error: null,
    isPlaying: false,
  }
}

function validateVideoFile(file) {
  if (!file) return { valid: false, message: '请选择视频文件。' }

  const extension = String(file.name || '').split('.').pop()?.toLowerCase()
  const typeAllowed = ALLOWED_VIDEO_TYPES.has(file.type)
  const extensionAllowed = ALLOWED_VIDEO_EXTENSIONS.has(extension)

  if (!typeAllowed && !extensionAllowed) {
    return { valid: false, message: '暂不支持这个视频格式，请选择 MP4 或 MOV。' }
  }

  if (Number(file.size) > MAX_VIDEO_BYTES) {
    return { valid: false, message: '视频超过 500MB，请压缩后重新选择。' }
  }

  return { valid: true, message: '' }
}

function validateVideoDuration(durationSec) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { valid: false, message: '无法读取视频时长，请重新选择视频。' }
  }

  if (durationSec > MAX_VIDEO_DURATION_SEC) {
    return { valid: false, message: '视频超过 3 分钟，请截取需要分析的片段。' }
  }

  return { valid: true, message: '' }
}

function canStartProcessing(state) {
  return Boolean(
    state.videos.teacher
    && state.videos.user
    && !state.videos.teacher.playbackError
    && !state.videos.user.playbackError
    && isVideoReady(state.videos.teacher)
    && isVideoReady(state.videos.user),
  )
}

function isVideoReady(video) {
  return !video.processingStatus || video.processingStatus === 'ready'
}

function canStartAnalysis(state) {
  return canStartProcessing(state)
    && Boolean(state.subjectSelections.teacher)
    && Boolean(state.subjectSelections.user)
    && Boolean(state.alignment?.status === 'ready')
}

function getActiveMismatchIndex(mismatches, commonTime) {
  if (!Array.isArray(mismatches)) return -1
  return mismatches.findIndex((item) => (
    commonTime >= Number(item.startTime)
    && commonTime <= Number(item.endTime)
  ))
}

function nextTaskVersion(state) {
  state.taskVersion += 1
  return state.taskVersion
}

export {
  ALLOWED_VIDEO_EXTENSIONS,
  APP_STAGES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DURATION_SEC,
  canStartAnalysis,
  canStartProcessing,
  createInitialAppState,
  getActiveMismatchIndex,
  nextTaskVersion,
  validateVideoDuration,
  validateVideoFile,
}
