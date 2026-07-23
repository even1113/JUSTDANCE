import { createIndependentVideoPlayback } from './hooks/useIndependentVideoPlayback.js'
import { alignAudioTracks, createManualAudioAlignment } from './services/audioAlignment.js'
import {
  canStartAnalysis,
  canStartProcessing,
  createInitialAppState,
  getActiveMismatchIndex,
  nextTaskVersion,
  toggleExpandedMismatchId,
  validateVideoDuration,
  validateVideoFile,
} from './services/appState.js'
import { createComparisonApiClient } from './services/comparisonApiClient.js'
import { createPosePlaybackRenderer, runPoseComparison } from './services/poseExtractor.js'
import {
  completeAnalysisTrace,
  createAnalysisTrace,
  failAnalysisTrace,
  traceStatusLabel,
  upsertAnalysisTrace,
} from './services/analysisTrace.js'
import { buildStructuredAnalysisForModel } from './services/feedbackGenerator.js'
import { assertValidStructuredAnalysis } from './services/structuredAnalysisSchema.js'
import { renderCandidateCard, renderIssueCard } from './components/uiComponents.js'

const comparisonApi = createComparisonApiClient()
const VIDEO_METADATA_TIMEOUT_MS = 20000
const DEFAULT_CROP_RECT = { x: 0.28, y: 0.08, width: 0.44, height: 0.84 }
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25]
const PLAYBACK_STEP_SEC = 0.03
const ANALYSIS_COMPLETE_HOLD_MS = 2500
const PROCESSING_STEPS = [
  { key: 'upload', label: '确认视频文件', detail: '正在确认两段视频均可用于本次比对' },
  { key: 'transcode', label: '统一播放格式', detail: '正在准备浏览器可稳定播放的视频版本' },
  { key: 'alignment', label: '对齐共同动作区间', detail: '正在根据音轨寻找共同的动作起点' },
  { key: 'subject', label: '确认目标人物', detail: '请确认本次需要持续跟踪的人物' },
]
const ANALYSIS_STEPS = [
  { key: 'keyframes', label: '提取关键帧', detail: '正在按视频时间轴读取可分析画面' },
  { key: 'pose', label: '识别人体姿态', detail: '正在提取双视频中的可用姿态轨迹' },
  { key: 'difference', label: '定位动作差异', detail: '正在比对节奏、动作幅度和关节路径' },
  { key: 'coach', label: '生成复盘建议', detail: '正在根据结构化差异整理可执行建议' },
]
const UPLOAD_STATUS_COPY = {
  validating: '正在校验',
  initializing: '正在准备上传',
  uploading: '正在上传',
  uploaded: '等待处理',
  transcoding: '正在统一格式',
  ready: '✓ 已准备好',
  error: '处理失败',
}
const FLOW_INDEX = {
  upload: 0,
  processing: 1,
  'subject-selection': 1,
  'manual-alignment': 1,
  ready: 2,
  analyzing: 2,
  report: 3,
  'blocking-error': 1,
}

const state = createInitialAppState()
const teacherVideoRef = { current: null }
const userVideoRef = { current: null }
let activeController = null
let sessionPromise = null
const uploadControllers = new Map()
let pendingConfirmation = null
let toastTimer = null
let activeCropRole = null
let cropDraft = { ...DEFAULT_CROP_RECT }
let cropPointerId = null
let cropStartPoint = null
let posePlaybackDisposers = []

const elements = {
  stageViews: [...document.querySelectorAll('[data-stage]')],
  flowSteps: [...document.querySelectorAll('[data-flow-step]')],
  appMain: document.querySelector('#appMain'),
  teacherVideoInput: document.querySelector('#teacherVideoInput'),
  userVideoInput: document.querySelector('#userVideoInput'),
  startProcessing: document.querySelector('#startProcessing'),
  processingAssets: document.querySelector('#processingAssets'),
  processingStepper: document.querySelector('#processingStepper'),
  processingMessage: document.querySelector('#processingMessage'),
  subjectDescription: document.querySelector('#subjectDescription'),
  subjectStepLabel: document.querySelector('#subjectStepLabel'),
  subjectRoleLabel: document.querySelector('#subjectRoleLabel'),
  subjectFrame: document.querySelector('#subjectFrame'),
  candidateGrid: document.querySelector('#candidateGrid'),
  confirmSubject: document.querySelector('#confirmSubject'),
  manualSubjectBox: document.querySelector('#manualSubjectBox'),
  cropBackdrop: document.querySelector('#cropBackdrop'),
  cropTitle: document.querySelector('#cropTitle'),
  cropClose: document.querySelector('#cropClose'),
  cropStage: document.querySelector('#cropStage'),
  cropVideo: document.querySelector('#cropVideo'),
  cropSelection: document.querySelector('#cropSelection'),
  cropHint: document.querySelector('#cropHint'),
  cropReset: document.querySelector('#cropReset'),
  cropCancel: document.querySelector('#cropCancel'),
  cropConfirm: document.querySelector('#cropConfirm'),
  teacherAnchorRange: document.querySelector('#teacherAnchorRange'),
  userAnchorRange: document.querySelector('#userAnchorRange'),
  teacherAnchorOutput: document.querySelector('#teacherAnchorOutput'),
  userAnchorOutput: document.querySelector('#userAnchorOutput'),
  confirmAlignment: document.querySelector('#confirmAlignment'),
  retryAutoAlignment: document.querySelector('#retryAutoAlignment'),
  readyWorkspaceMount: document.querySelector('#readyWorkspaceMount'),
  reportWorkspaceMount: document.querySelector('#reportWorkspaceMount'),
  comparisonWorkspace: document.querySelector('#comparisonWorkspace'),
  teacherCompareVideo: document.querySelector('#teacherCompareVideo'),
  userCompareVideo: document.querySelector('#userCompareVideo'),
  teacherPoseCanvas: document.querySelector('#teacherPoseCanvas'),
  userPoseCanvas: document.querySelector('#userPoseCanvas'),
  workspaceAlignmentBadge: document.querySelector('#workspaceAlignmentBadge'),
  sharedProgress: document.querySelector('#sharedProgress'),
  timelineOverlay: document.querySelector('#timelineOverlay'),
  sharedTime: document.querySelector('#sharedTime'),
  activeNodeLabel: document.querySelector('#activeNodeLabel'),
  sharedPlay: document.querySelector('#sharedPlay'),
  stepBack: document.querySelector('#stepBack'),
  stepForward: document.querySelector('#stepForward'),
  playbackRate: document.querySelector('#playbackRate'),
  startAnalysis: document.querySelector('#startAnalysis'),
  reselectSubject: document.querySelector('#reselectSubject'),
  analysisStepper: document.querySelector('#analysisStepper'),
  analysisProcessPanel: document.querySelector('#analysisProcessPanel'),
  analysisLiveMessage: document.querySelector('#analysisLiveMessage'),
  analysisRealProgress: document.querySelector('#analysisRealProgress'),
  analysisFrameStats: document.querySelector('#analysisFrameStats'),
  analysisErrorTrace: document.querySelector('#analysisErrorTrace'),
  analysisErrorTraceContent: document.querySelector('#analysisErrorTraceContent'),
  analysisFallback: document.querySelector('#analysisFallback'),
  cancelAnalysis: document.querySelector('#cancelAnalysis'),
  reportTitle: document.querySelector('#reportTitle'),
  coachSummaryTitle: document.querySelector('#coachSummaryTitle'),
  coachSummaryText: document.querySelector('#coachSummaryText'),
  issueCount: document.querySelector('#issueCount'),
  reportIssueList: document.querySelector('#reportIssueList'),
  practiceSteps: document.querySelector('#practiceSteps'),
  reviewTips: document.querySelector('#reviewTips'),
  safetyNote: document.querySelector('#safetyNote'),
  trackingGapMessage: document.querySelector('#trackingGapMessage'),
  deleteFromReport: document.querySelector('#deleteFromReport'),
  blockingErrorMessage: document.querySelector('#blockingErrorMessage'),
  retryFromError: document.querySelector('#retryFromError'),
  privacyBackdrop: document.querySelector('#privacyBackdrop'),
  privacyOpen: document.querySelector('#privacyOpen'),
  footerPrivacy: document.querySelector('#footerPrivacy'),
  privacyClose: document.querySelector('#privacyClose'),
  privacyDone: document.querySelector('#privacyDone'),
  deleteSession: document.querySelector('#deleteSession'),
  confirmBackdrop: document.querySelector('#confirmBackdrop'),
  confirmTitle: document.querySelector('#confirmTitle'),
  confirmMessage: document.querySelector('#confirmMessage'),
  confirmAction: document.querySelector('#confirmAction'),
  confirmCancel: document.querySelector('#confirmCancel'),
  confirmIcon: document.querySelector('#confirmIcon'),
  toast: document.querySelector('#toast'),
}

teacherVideoRef.current = elements.teacherCompareVideo
userVideoRef.current = elements.userCompareVideo

const videoPlayback = createIndependentVideoPlayback({
  teacherVideoRef,
  userVideoRef,
  onTimeUpdate: ({ commonTime }) => updateCommonTime(commonTime),
  onPlaybackChange: ({ isPlaying }) => {
    state.isPlaying = isPlaying
    elements.sharedPlay.textContent = isPlaying ? 'Ⅱ' : '▶'
    elements.sharedPlay.setAttribute('aria-label', isPlaying ? '暂停双视频' : '播放双视频')
  },
})

function setStage(stage, { focus = true } = {}) {
  state.stage = stage
  elements.stageViews.forEach((view) => view.classList.toggle('active', view.dataset.stage === stage))
  renderFlowProgress(stage)

  if (stage === 'ready' || stage === 'report') {
    const mount = stage === 'ready' ? elements.readyWorkspaceMount : elements.reportWorkspaceMount
    mount.append(elements.comparisonWorkspace)
    elements.comparisonWorkspace.classList.remove('hidden')
    renderWorkspace()
  } else {
    elements.comparisonWorkspace.classList.add('hidden')
    disposePosePlaybackRenderers()
    stopPlayback()
  }

  if (focus) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    elements.appMain.focus({ preventScroll: true })
  }
}

function renderFlowProgress(stage) {
  const activeIndex = FLOW_INDEX[stage] ?? 0
  elements.flowSteps.forEach((step, index) => {
    step.classList.toggle('active', index === activeIndex)
    step.classList.toggle('complete', index < activeIndex)
  })
}

function renderUploadState() {
  for (const role of ['teacher', 'user']) renderUploadCard(role)
  const ready = canStartProcessing(state)
  elements.startProcessing.disabled = !ready
  const hasBoth = Boolean(state.videos.teacher && state.videos.user)
  elements.startProcessing.textContent = ready
    ? '立即体验AI分析舞蹈动作'
    : hasBoth ? '视频正在上传和统一格式' : '请先添加两段视频'
}

function renderUploadCard(role) {
  const asset = state.videos[role]
  const card = document.querySelector(`[data-upload-card="${role}"]`)
  const dropzone = card.querySelector('.upload-dropzone')
  const preview = card.querySelector('.upload-preview')
  const status = card.querySelector('output')
  const video = preview.querySelector('video')
  const fieldMessage = card.querySelector('.field-message')
  const progress = card.querySelector('.upload-progress')
  const statusNote = preview.querySelector('.upload-success-note')
  const retryButton = preview.querySelector('[data-retry-upload]')

  status.textContent = asset ? (UPLOAD_STATUS_COPY[asset.processingStatus] || '已选择') : '未添加'
  card.classList.toggle('is-uploaded', Boolean(asset))
  card.classList.remove('has-error')
  dropzone.classList.toggle('hidden', Boolean(asset))
  preview.classList.toggle('hidden', !asset)
  fieldMessage.textContent = asset?.message || ''
  fieldMessage.classList.toggle('error', Boolean(asset?.message))

  if (!asset) {
    video.removeAttribute('src')
    video.load()
    progress.classList.add('hidden')
    retryButton.classList.add('hidden')
    return
  }

  const uploadPercent = Math.max(0, Math.min(100, Number(asset.uploadProgress) || 0))
  progress.value = uploadPercent
  progress.classList.toggle('hidden', ['ready', 'error'].includes(asset.processingStatus))
  retryButton.classList.toggle('hidden', asset.processingStatus !== 'error')
  statusNote.textContent = asset.processingStatus === 'ready' ? '✓ 已准备好' : (UPLOAD_STATUS_COPY[asset.processingStatus] || '正在准备')

  preview.querySelector('.upload-file-copy strong').textContent = asset.name
  preview.querySelector('.upload-file-copy small').textContent = `${formatFileSize(asset.size)} · ${formatDuration(asset.duration)}`
  if (video.src !== asset.url) video.src = asset.url
  primeVideoPreview(video)
}

function primeVideoPreview(video) {
  if (!video) return
  video.muted = true
  video.defaultMuted = true
  video.playsInline = true
  video.setAttribute('playsinline', '')

  const seekPreviewFrame = () => {
    const duration = Number(video.duration)
    if (!Number.isFinite(duration) || duration <= 0 || video.currentTime > 0.01) return
    const previewTime = Math.min(Math.max(duration * 0.03, 0.05), 1)
    try {
      video.currentTime = previewTime
    } catch {
      // Some mobile browsers delay seeking until enough local data is available.
    }
  }

  if (video.readyState >= 1) seekPreviewFrame()
  else video.addEventListener('loadedmetadata', seekPreviewFrame, { once: true })
}

async function loadVideoFile(role, file) {
  const validation = validateVideoFile(file)
  if (!validation.valid) {
    setFieldError(role, validation.message)
    return
  }

  const url = URL.createObjectURL(file)
  try {
    const metadata = await readVideoMetadata(url, file)
    const durationValidation = validateVideoDuration(metadata.duration)
    if (!durationValidation.valid) {
      URL.revokeObjectURL(url)
      setFieldError(role, durationValidation.message)
      return
    }

    revokeAssetUrl(state.videos[role])
    state.videos[role] = {
      role,
      source: 'local',
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      url,
      processingStatus: 'validating',
      uploadProgress: 0,
    }
    renderUploadState()
    await uploadSelectedVideo(role, state.videos[role])
  } catch (error) {
    URL.revokeObjectURL(url)
    setFieldError(role, error.userMessage || '无法读取这个视频，请重新选择 MP4 或 MOV。')
  }
}

async function uploadSelectedVideo(role, asset) {
  uploadControllers.get(role)?.abort()
  const controller = new AbortController()
  uploadControllers.set(role, controller)
  asset.message = ''
  asset.processingStatus = 'initializing'
  asset.uploadProgress = 0
  renderUploadState()

  try {
    const session = await ensureComparisonSession()
    const video = await comparisonApi.uploadVideo({
      sessionId: session.sessionId,
      token: session.token,
      role,
      file: asset.file,
      signal: controller.signal,
      onProgress(progress) {
        if (state.videos[role] !== asset) return
        asset.processingStatus = progress.stage
        if (Number.isFinite(progress.loaded) && Number.isFinite(progress.total) && progress.total > 0) {
          asset.uploadProgress = Math.round((progress.loaded / progress.total) * 100)
        }
        if (progress.video) {
          asset.serverId = progress.video.id
          asset.serverMetadata = progress.video.metadata
        }
        renderUploadState()
      },
    })
    if (state.videos[role] !== asset) return
    asset.serverId = video.id
    asset.playbackUrl = video.playbackUrl
    asset.serverMetadata = video.metadata
    asset.processingStatus = 'ready'
    asset.uploadProgress = 100
    asset.duration = Number(video.metadata?.durationSec) || asset.duration
    asset.width = Number(video.metadata?.width) || asset.width
    asset.height = Number(video.metadata?.height) || asset.height
    asset.message = ''
    renderUploadState()
    showToast(`${role === 'teacher' ? '老师' : '我的'}视频已上传并完成格式处理`)
  } catch (error) {
    if (error.name === 'AbortError' || state.videos[role] !== asset) return
    asset.processingStatus = 'error'
    asset.message = error.message || '视频上传或处理失败，请重新选择。'
    renderUploadState()
    showToast(asset.message, 'error')
  } finally {
    if (uploadControllers.get(role) === controller) uploadControllers.delete(role)
  }
}

function retryUpload(role) {
  const asset = state.videos[role]
  if (!asset?.file || asset.processingStatus !== 'error') return
  uploadSelectedVideo(role, asset)
}

async function ensureComparisonSession() {
  if (state.sessionId && state.sessionToken) {
    return { sessionId: state.sessionId, token: state.sessionToken }
  }
  if (!sessionPromise) {
    sessionPromise = comparisonApi.createSession()
      .then((session) => {
        state.sessionId = session.sessionId
        state.sessionToken = session.token
        return session
      })
      .finally(() => {
        sessionPromise = null
      })
  }
  return sessionPromise
}

function setFieldError(role, message) {
  const card = document.querySelector(`[data-upload-card="${role}"]`)
  const fieldMessage = card.querySelector('.field-message')
  fieldMessage.textContent = message
  fieldMessage.classList.add('error')
  card.classList.add('has-error')
}

async function startProcessing() {
  if (!canStartProcessing(state)) return
  abortActiveTask()
  nextTaskVersion(state)
  state.error = null
  state.errorContext = null
  state.processingSteps = { active: null, completed: [], steps: PROCESSING_STEPS }
  renderAssetSummary()
  renderStepper(elements.processingStepper, state.processingSteps)
  setStage('processing')
  activeController = new AbortController()

  try {
    await ensureComparisonSession()
    state.processingSteps = {
      active: 'alignment',
      completed: ['upload', 'transcode'],
      steps: PROCESSING_STEPS,
    }
    renderStepper(elements.processingStepper, state.processingSteps)
    elements.processingMessage.textContent = '正在以老师视频音轨为基准寻找共同动作区间'
    const alignment = await resolveAlignment({ status: 'ready', offsetSec: 0 })
    const completed = alignment.status === 'manual-required'
      ? ['upload', 'transcode']
      : ['upload', 'transcode', 'alignment']
    state.processingSteps = { active: 'subject', completed, steps: PROCESSING_STEPS }
    renderStepper(elements.processingStepper, state.processingSteps)
    elements.processingMessage.textContent = '请选择自动锁定主要人物，复杂画面可手动框选'
    await finishVideoPreparation({ alignment, needsSubjectSelection: true })
  } catch (error) {
    if (error.name === 'AbortError') return
    state.error = error.message || '视频处理服务暂时不可用，请稍后重试。'
    state.errorContext = 'processing'
    elements.blockingErrorMessage.textContent = state.error
    renderAnalysisTrace()
    setStage('blocking-error')
  } finally {
    activeController = null
  }
}

async function finishVideoPreparation(result) {
  state.alignment = result.alignment?.timeline
    ? result.alignment
    : await resolveAlignment(result.alignment)
  state.subjectStep = 'teacher'
  state.subjectSelections = result.needsSubjectSelection
    ? { teacher: null, user: null }
    : { teacher: 'automatic', user: 'automatic' }

  if (result.needsSubjectSelection) {
    renderSubjectSelection()
    setStage('subject-selection')
  } else if (state.alignment.status === 'manual-required') {
    prepareManualAlignment()
  } else {
    setStage('ready')
  }
}

async function resolveAlignment(alignmentHint) {
  if (alignmentHint.status === 'manual-required') return alignmentHint
  const bothLocal = state.videos.teacher?.source === 'local' && state.videos.user?.source === 'local'
  if (!bothLocal) return createReadyAlignment(alignmentHint.offsetSec || 0)

  try {
    const alignment = await alignAudioTracks(state.videos.teacher.file, state.videos.user.file)
    return { ...alignment, status: 'ready' }
  } catch {
    return { status: 'manual-required', offsetSec: 0, duration: getComparisonDuration() }
  }
}

function renderAssetSummary() {
  elements.processingAssets.innerHTML = ['teacher', 'user'].map((role) => {
    const asset = state.videos[role]
    const label = role === 'teacher' ? '老师示范' : '我的练习'
    return `<article><span class="role-label ${role}">${label}</span><strong>${escapeHtml(asset.name)}</strong><small>${formatDuration(asset.duration)} · ${formatFileSize(asset.size)}</small></article>`
  }).join('')
}

function renderStepper(container, progress) {
  const completed = new Set(progress.completed || [])
  container.innerHTML = (progress.steps || []).map((step) => {
    const status = completed.has(step.key)
      ? 'complete'
      : progress.error === step.key
        ? 'error'
        : progress.active === step.key ? 'active' : ''
    const symbol = completed.has(step.key) ? '✓' : progress.error === step.key ? '!' : '<span></span>'
    return `<li class="${status}"><i class="step-icon">${symbol}</i><div class="step-copy"><strong>${escapeHtml(step.label)}</strong>${step.detail ? `<small>${escapeHtml(step.detail)}</small>` : ''}</div></li>`
  }).join('')
}

function renderSubjectSelection() {
  const role = state.subjectStep
  const isTeacher = role === 'teacher'
  const selected = state.subjectSelections[role]
  const selectedId = getSubjectSelectionId(selected)
  const asset = state.videos[role]
  elements.subjectDescription.textContent = isTeacher
    ? '默认自动锁定老师视频中的主要人物；多人或遮挡场景建议手动框选。'
    : '默认自动锁定练习视频中的主要人物；多人或遮挡场景建议手动框选自己。'
  elements.subjectStepLabel.textContent = isTeacher ? '第 1 步，共 2 步' : '第 2 步，共 2 步'
  document.querySelectorAll('.selection-progress i').forEach((item, index) => item.classList.toggle('active', index <= (isTeacher ? 0 : 1)))
  elements.subjectFrame.innerHTML = renderSubjectFrame({ asset, role, isTeacher, selected })
  elements.candidateGrid.innerHTML = renderCandidateCard({
    id: 'automatic',
    role,
    index: 1,
    selected: selectedId === 'automatic',
    label: '自动锁定主要人物',
  })
  elements.confirmSubject.disabled = !selected
  elements.confirmSubject.textContent = selected ? (isTeacher ? '确认老师人物' : '确认是我') : '请选择一位人物'

  const frameVideo = elements.subjectFrame.querySelector('video')
  const selectionBox = elements.subjectFrame.querySelector('.subject-selected-box')
  primeVideoPreview(frameVideo)
  if (selectionBox) {
    const renderBox = () => positionNormalizedBox(
      elements.subjectFrame,
      selectionBox,
      getNormalizedSubjectRect(selected),
      frameVideo,
    )
    if (frameVideo && frameVideo.readyState < 1) frameVideo.addEventListener('loadedmetadata', renderBox, { once: true })
    else window.requestAnimationFrame(renderBox)
  }
}

function renderSubjectFrame({ asset, role, isTeacher, selected }) {
  const label = isTeacher ? '老师视频' : '我的视频'
  const media = `<video class="subject-source-video" src="${escapeHtml(asset?.url || '')}" muted playsinline preload="metadata" aria-label="${label}人物框选预览"></video>`
  const selectedBox = selected
    ? `<div class="subject-selected-box ${role}" aria-hidden="true"><span>${getSubjectSelectionId(selected) === 'manual' ? '手动框选' : '已选择'}</span></div>`
    : ''

  return `<span class="role-label ${role}">${label}</span>${media}${selectedBox}`
}

function getSubjectSelectionId(selection) {
  return typeof selection === 'string' ? selection : selection?.id || null
}

function getNormalizedSubjectRect(selection) {
  if (selection?.mode === 'manual' && selection.rect) {
    const sourceWidth = Math.max(1, Number(selection.rect.sourceWidth) || 1)
    const sourceHeight = Math.max(1, Number(selection.rect.sourceHeight) || 1)
    return {
      x: clamp(Number(selection.rect.x) / sourceWidth, 0, 1),
      y: clamp(Number(selection.rect.y) / sourceHeight, 0, 1),
      width: clamp(Number(selection.rect.width) / sourceWidth, 0.01, 1),
      height: clamp(Number(selection.rect.height) / sourceHeight, 0.01, 1),
    }
  }

  const candidateIndex = Number(String(getSubjectSelectionId(selection) || '').replace('person-', '')) - 1
  if (candidateIndex === 0) return { x: 0.04, y: 0.12, width: 0.28, height: 0.76 }
  if (candidateIndex === 2) return { x: 0.68, y: 0.12, width: 0.28, height: 0.76 }
  return { ...DEFAULT_CROP_RECT }
}

function selectSubject(id) {
  state.subjectSelections[state.subjectStep] = id
  renderSubjectSelection()
}

function confirmSubject() {
  if (!state.subjectSelections[state.subjectStep]) return
  if (state.subjectStep === 'teacher') {
    state.subjectStep = 'user'
    renderSubjectSelection()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  if (state.alignment?.status === 'manual-required') prepareManualAlignment()
  else setStage('ready')
}

function openSubjectCrop() {
  activeCropRole = state.subjectStep
  const asset = state.videos[activeCropRole]
  const roleLabel = activeCropRole === 'teacher' ? '老师视频' : '我的视频'
  elements.cropTitle.textContent = `框选${roleLabel}里要持续跟踪的人`
  elements.cropBackdrop.classList.remove('hidden')
  document.body.classList.add('modal-open')
  elements.cropVideo.classList.remove('hidden')
  cropDraft = getNormalizedSubjectRect(state.subjectSelections[activeCropRole])
  elements.cropHint.textContent = '在人物全身外侧拖动一个框。框选区域会换算到视频原始尺寸，不受手机屏幕缩放影响。'

  elements.cropVideo.src = asset?.url || ''
  const handleReady = () => {
    if (Number.isFinite(elements.cropVideo.duration) && elements.cropVideo.duration > 0) {
      elements.cropVideo.currentTime = Math.min(0.05, elements.cropVideo.duration / 2)
    }
    renderCropDraft()
  }
  if (elements.cropVideo.readyState >= 1) handleReady()
  else elements.cropVideo.addEventListener('loadedmetadata', handleReady, { once: true })

  elements.cropClose.focus({ preventScroll: true })
}

function closeSubjectCrop() {
  elements.cropBackdrop.classList.add('hidden')
  document.body.classList.remove('modal-open')
  cropPointerId = null
  cropStartPoint = null
  activeCropRole = null
  elements.cropVideo.removeAttribute('src')
  elements.cropVideo.load()
  elements.manualSubjectBox.focus({ preventScroll: true })
}

function resetCropDraft() {
  cropDraft = { ...DEFAULT_CROP_RECT }
  elements.cropHint.textContent = '已恢复到中央区域。你仍可在画面上拖动，重新框住目标人物。'
  renderCropDraft()
}

function confirmSubjectCrop() {
  if (!activeCropRole || cropDraft.width < 0.04 || cropDraft.height < 0.04) {
    elements.cropHint.textContent = '框选范围太小，请把人物的头、手臂和双脚都包含在框内。'
    return
  }

  const asset = state.videos[activeCropRole]
  const sourceWidth = Number(elements.cropVideo.videoWidth) || Number(asset?.width) || 1
  const sourceHeight = Number(elements.cropVideo.videoHeight) || Number(asset?.height) || 1
  state.subjectSelections[activeCropRole] = {
    id: 'manual',
    mode: 'manual',
    rect: {
      x: cropDraft.x * sourceWidth,
      y: cropDraft.y * sourceHeight,
      width: cropDraft.width * sourceWidth,
      height: cropDraft.height * sourceHeight,
      sourceWidth,
      sourceHeight,
    },
  }
  const roleLabel = activeCropRole === 'teacher' ? '老师' : '我的'
  closeSubjectCrop()
  renderSubjectSelection()
  showToast(`已锁定${roleLabel}视频中的框选人物`)
}

function startCropPointer(event) {
  if (event.button !== undefined && event.button !== 0) return
  cropPointerId = event.pointerId
  cropStartPoint = getCropPointerPosition(event)
  cropDraft = { x: cropStartPoint.x, y: cropStartPoint.y, width: 0, height: 0 }
  elements.cropStage.setPointerCapture?.(event.pointerId)
  event.preventDefault()
  renderCropDraft()
}

function moveCropPointer(event) {
  if (cropPointerId === null || event.pointerId !== cropPointerId || !cropStartPoint) return
  const point = getCropPointerPosition(event)
  cropDraft = {
    x: Math.min(cropStartPoint.x, point.x),
    y: Math.min(cropStartPoint.y, point.y),
    width: Math.abs(point.x - cropStartPoint.x),
    height: Math.abs(point.y - cropStartPoint.y),
  }
  event.preventDefault()
  renderCropDraft()
}

function endCropPointer(event) {
  if (cropPointerId === null || event.pointerId !== cropPointerId) return
  const point = getCropPointerPosition(event)
  if (cropDraft.width < 0.04 || cropDraft.height < 0.04) {
    cropDraft = {
      x: clamp(point.x - 0.2, 0, 0.6),
      y: clamp(point.y - 0.38, 0, 0.24),
      width: 0.4,
      height: 0.76,
    }
  }
  elements.cropStage.releasePointerCapture?.(event.pointerId)
  cropPointerId = null
  cropStartPoint = null
  elements.cropHint.textContent = '已画好跟踪区域。确认人物完整入框后，点击“确认框选”。'
  event.preventDefault()
  renderCropDraft()
}

function cancelCropPointer(event) {
  if (cropPointerId === null || event.pointerId !== cropPointerId) return
  elements.cropStage.releasePointerCapture?.(event.pointerId)
  cropPointerId = null
  cropStartPoint = null
  renderCropDraft()
}

function getCropPointerPosition(event) {
  const stageRect = elements.cropStage.getBoundingClientRect()
  const contentRect = getContainedMediaRect(
    stageRect.width,
    stageRect.height,
    elements.cropVideo.classList.contains('hidden') ? stageRect.width : elements.cropVideo.videoWidth,
    elements.cropVideo.classList.contains('hidden') ? stageRect.height : elements.cropVideo.videoHeight,
  )
  const localX = clamp(event.clientX - stageRect.left - contentRect.left, 0, contentRect.width)
  const localY = clamp(event.clientY - stageRect.top - contentRect.top, 0, contentRect.height)
  return {
    x: contentRect.width ? localX / contentRect.width : 0.5,
    y: contentRect.height ? localY / contentRect.height : 0.5,
  }
}

function renderCropDraft() {
  positionNormalizedBox(elements.cropStage, elements.cropSelection, cropDraft, elements.cropVideo.classList.contains('hidden') ? null : elements.cropVideo)
}

function positionNormalizedBox(stage, box, normalizedRect, video = null) {
  if (!stage || !box || !normalizedRect) return
  const mediaRect = getContainedMediaRect(
    stage.clientWidth,
    stage.clientHeight,
    video?.videoWidth,
    video?.videoHeight,
  )
  box.style.left = `${mediaRect.left + normalizedRect.x * mediaRect.width}px`
  box.style.top = `${mediaRect.top + normalizedRect.y * mediaRect.height}px`
  box.style.width = `${normalizedRect.width * mediaRect.width}px`
  box.style.height = `${normalizedRect.height * mediaRect.height}px`
}

function getContainedMediaRect(containerWidth, containerHeight, mediaWidth, mediaHeight) {
  const safeContainerWidth = Math.max(1, Number(containerWidth) || 1)
  const safeContainerHeight = Math.max(1, Number(containerHeight) || 1)
  const safeMediaWidth = Math.max(1, Number(mediaWidth) || safeContainerWidth)
  const safeMediaHeight = Math.max(1, Number(mediaHeight) || safeContainerHeight)
  const scale = Math.min(safeContainerWidth / safeMediaWidth, safeContainerHeight / safeMediaHeight)
  const width = safeMediaWidth * scale
  const height = safeMediaHeight * scale
  return {
    left: (safeContainerWidth - width) / 2,
    top: (safeContainerHeight - height) / 2,
    width,
    height,
  }
}

function prepareManualAlignment() {
  state.manualAnchors = { teacher: null, user: null }
  elements.teacherAnchorOutput.textContent = '尚未选择'
  elements.userAnchorOutput.textContent = '尚未选择'
  elements.confirmAlignment.disabled = true
  renderCalibrationVideos()
  setStage('manual-alignment')
}

function renderCalibrationVideos() {
  document.querySelectorAll('[data-calibration]').forEach((frame) => {
    const role = frame.dataset.calibration
    const asset = state.videos[role]
    frame.innerHTML = `<video src="${escapeHtml(asset?.playbackUrl || asset?.url || '')}" muted playsinline preload="metadata" aria-label="${role === 'teacher' ? '老师' : '我的'}视频校准预览"></video>`
  })
}

function setManualAnchor(role) {
  const input = role === 'teacher' ? elements.teacherAnchorRange : elements.userAnchorRange
  const output = role === 'teacher' ? elements.teacherAnchorOutput : elements.userAnchorOutput
  state.manualAnchors[role] = Number(input.value)
  output.textContent = `${formatTime(input.value)} 已选择`
  elements.confirmAlignment.disabled = !Number.isFinite(state.manualAnchors.teacher) || !Number.isFinite(state.manualAnchors.user)
}

function confirmManualAlignment() {
  const offset = state.manualAnchors.user - state.manualAnchors.teacher
  const alignment = createManualAudioAlignment(
    offset,
    state.videos.teacher.duration,
    state.videos.user.duration,
  )
  state.alignment = { ...alignment, status: 'ready' }
  showToast('动作起点已对齐')
  setStage('ready')
}

function createReadyAlignment(offsetSec = 0) {
  const alignment = createManualAudioAlignment(
    offsetSec,
    state.videos.teacher?.duration || 0,
    state.videos.user?.duration || 0,
  )
  return { ...alignment, method: 'audio', status: 'ready' }
}

function renderWorkspace() {
  const duration = getComparisonDuration()
  elements.sharedProgress.max = String(duration)
  elements.sharedProgress.value = String(Math.min(state.commonTime, duration))
  elements.workspaceAlignmentBadge.textContent = state.alignment?.method === 'manual' ? '手动校准完成' : '音乐同步完成'

  for (const role of ['teacher', 'user']) {
    const video = role === 'teacher' ? elements.teacherCompareVideo : elements.userCompareVideo
    const asset = state.videos[role]
    video.classList.remove('hidden')
    const playbackUrl = asset.playbackUrl || asset.url
    if (asset.playbackUrl) video.crossOrigin = 'anonymous'
    setVideoSource(video, playbackUrl)
    renderWorkspaceSubjectLock(role)
  }

  if (state.alignment?.timeline) {
    videoPlayback.refresh()
    videoPlayback.setAlignment(state.alignment)
  }
  renderTimeline()
  updateCommonTime(state.commonTime, { skipIssueRender: true })
  window.requestAnimationFrame(setupPosePlaybackRenderers)
}

function setVideoSource(video, source) {
  const normalizedSource = new URL(source, window.location.href).href
  if (video.currentSrc === normalizedSource || video.src === normalizedSource) return
  video.src = normalizedSource
}

function setupPosePlaybackRenderers() {
  disposePosePlaybackRenderers()
  const teacherFrames = state.poseFrames?.teacher
  const userFrames = state.poseFrames?.user
  if (!teacherFrames?.length || !userFrames?.length) return

  posePlaybackDisposers = [
    createPosePlaybackRenderer(
      elements.teacherCompareVideo,
      elements.teacherPoseCanvas,
      teacherFrames,
      { color: '#b7f34a' },
    ),
    createPosePlaybackRenderer(
      elements.userCompareVideo,
      elements.userPoseCanvas,
      userFrames,
      { color: '#ff5a7a' },
    ),
  ]
}

function disposePosePlaybackRenderers() {
  posePlaybackDisposers.forEach((dispose) => dispose())
  posePlaybackDisposers = []
}

function renderWorkspaceSubjectLock(role) {
  const video = role === 'teacher' ? elements.teacherCompareVideo : elements.userCompareVideo
  const viewport = video.closest('.viewport-media')
  const box = viewport?.querySelector('.subject-lock-box')
  const normalizedRect = getNormalizedSubjectRect(state.subjectSelections[role])
  const position = () => positionNormalizedBox(
    viewport,
    box,
    normalizedRect,
    video.classList.contains('hidden') ? null : video,
  )
  if (!video.classList.contains('hidden') && video.readyState < 1) {
    video.addEventListener('loadedmetadata', position, { once: true })
  } else {
    window.requestAnimationFrame(position)
  }
}

function renderVisibleSubjectLocks() {
  if (state.stage === 'subject-selection') {
    const frameVideo = elements.subjectFrame.querySelector('video')
    const selectionBox = elements.subjectFrame.querySelector('.subject-selected-box')
    positionNormalizedBox(
      elements.subjectFrame,
      selectionBox,
      getNormalizedSubjectRect(state.subjectSelections[state.subjectStep]),
      frameVideo,
    )
  }
  if (state.stage === 'ready' || state.stage === 'report') {
    renderWorkspaceSubjectLock('teacher')
    renderWorkspaceSubjectLock('user')
  }
  if (!elements.cropBackdrop.classList.contains('hidden')) renderCropDraft()
}

function renderTimeline() {
  const duration = getComparisonDuration()
  const mismatches = state.report?.mismatches || []
  const markers = mismatches.map((item, index) => {
    const left = clamp((item.startTime / duration) * 100, 0, 100)
    return `<button class="difference-marker ${index === state.activeMismatchIndex ? 'active' : ''}" style="left:${left}%" type="button" data-marker-index="${index}" aria-label="跳到 ${escapeHtml(item.timestamp)}：${escapeHtml(item.title)}"></button>`
  })
  const gaps = (state.report?.trackingGaps || []).map((gap) => {
    const left = clamp((gap.startTime / duration) * 100, 0, 100)
    const width = Math.max(1.5, ((gap.endTime - gap.startTime) / duration) * 100)
    return `<span class="tracking-marker" style="left:${left}%;width:${width}%" title="${escapeHtml(gap.message)}"></span>`
  })
  elements.timelineOverlay.innerHTML = markers.concat(gaps).join('')
}

async function togglePlayback() {
  try {
    await videoPlayback.playPause()
  } catch (error) {
    showToast(error.message, 'error')
  }
}

function stopPlayback() {
  videoPlayback.pauseAll()
}

function seekCommonTime(time) {
  const nextTime = clamp(Number(time), 0, getComparisonDuration())
  videoPlayback.seekCommon(nextTime)
}

function updateCommonTime(commonTime, { skipIssueRender = false } = {}) {
  const duration = getComparisonDuration()
  state.commonTime = clamp(Number(commonTime) || 0, 0, duration)
  elements.sharedProgress.value = String(state.commonTime)
  elements.sharedTime.textContent = `${formatTime(state.commonTime)} / ${formatTime(duration)}`

  const nextIndex = getActiveMismatchIndex(state.report?.mismatches, state.commonTime)
  if (nextIndex !== state.activeMismatchIndex) {
    state.activeMismatchIndex = nextIndex
    renderTimeline()
    if (!skipIssueRender && state.stage === 'report') renderIssueList()
  }
  const activeIssue = state.report?.mismatches?.[state.activeMismatchIndex]
  elements.activeNodeLabel.textContent = activeIssue ? activeIssue.title : state.report ? '当前时间没有明显差异' : '尚未生成差异节点'

}

async function startAnalysis(options = {}) {
  if (!canStartAnalysis(state)) {
    showToast('请先完成目标人物确认和视频校准', 'error')
    return
  }
  const isRetry = options?.isRetry === true
  abortActiveTask()
  disposePosePlaybackRenderers()
  nextTaskVersion(state)
  state.analysisSteps = { active: null, completed: [], steps: ANALYSIS_STEPS }
  state.analysisTrace = createAnalysisTrace({
    alignmentMethod: state.alignment?.method,
    isRetry,
  })
  state.poseFrames = null
  state.errorContext = null
  renderAnalysisTrace()
  renderStepper(elements.analysisStepper, state.analysisSteps)
  elements.analysisFallback.classList.add('hidden')
  elements.analysisProcessPanel.open = true
  setStage('analyzing')
  activeController = new AbortController()

  try {
    state.report = await runAnalysis(activeController.signal)
    renderAnalysisProgress({
      active: null,
      completed: ANALYSIS_STEPS.map((step) => step.key),
      steps: ANALYSIS_STEPS,
    }, {
      message: '分析已完成，正在保留本次处理记录并准备复盘。',
      status: 'complete',
    })
    state.analysisTrace = completeAnalysisTrace(state.analysisTrace)
    renderAnalysisTrace()
    state.activeMismatchIndex = 0
    state.expandedMismatchIds = state.report.mismatches[0]?.id
      ? [state.report.mismatches[0].id]
      : []
    state.commonTime = state.report.mismatches[0]?.startTime || 0
    await holdAnalysisResult(ANALYSIS_COMPLETE_HOLD_MS, activeController.signal)
    elements.analysisProcessPanel.open = false
    renderReport()
    setStage('report')
  } catch (error) {
    if (error.name === 'AbortError') return
    state.error = error.message || '动作分析没有完成，请稍后重试。'
    state.errorContext = 'analysis'
    const failedStep = analysisFailureStep(error)
    state.analysisSteps = {
      active: null,
      error: failedStep,
      completed: state.analysisSteps.completed || [],
      steps: ANALYSIS_STEPS,
    }
    renderStepper(elements.analysisStepper, state.analysisSteps)
    state.analysisTrace = failAnalysisTrace(
      state.analysisTrace,
      analysisFailureTraceStep(error),
      state.error,
    )
    renderAnalysisTrace()
    elements.blockingErrorMessage.textContent = state.error
    setStage('blocking-error')
  } finally {
    state.analysisTaskId = null
    activeController = null
  }
}

async function runAnalysis(signal) {
  renderAnalysisProgress({ active: 'keyframes', completed: [], steps: ANALYSIS_STEPS })
  const poseAnalysis = await runPoseComparison({
    teacherVideo: elements.teacherCompareVideo,
    userVideo: elements.userCompareVideo,
    cropInfo: analysisCropFor('user'),
    subjectSelections: {
      teacher: analysisCropFor('teacher'),
      user: analysisCropFor('user'),
    },
    audioAlignment: state.alignment,
    signal,
    onPoseFramesReady({ teacherFrames, userFrames }) {
      state.poseFrames = {
        teacher: teacherFrames,
        user: userFrames,
      }
    },
    onProgress(update) {
      const message = typeof update === 'string' ? update : update.message
      const progress = mapPoseAnalysisProgress(update)
      renderAnalysisProgress(progress, {
        message,
        metrics: update,
        status: update?.status,
        traceStepId: update?.stepId,
      })
    },
  })
  state.poseAnalysis = poseAnalysis
  const structuredAnalysis = assertValidStructuredAnalysis(buildStructuredAnalysisForModel(poseAnalysis))
  renderAnalysisProgress({
    active: 'difference',
    completed: ['keyframes', 'pose'],
    steps: ANALYSIS_STEPS,
  })

  return comparisonApi.startAnalysis({
    sessionId: state.sessionId,
    token: state.sessionToken,
    inputVersion: state.taskVersion,
    sharedDurationSec: getComparisonDuration(),
    structuredAnalysis,
    signal,
    onTaskCreated(analysis) {
      state.analysisTaskId = analysis.id
    },
    onStatus(analysis) {
      const traceUpdate = mapApiTraceUpdate(analysis)
      renderAnalysisProgress(mapApiAnalysisProgress(analysis), traceUpdate)
      elements.analysisFallback.classList.toggle('hidden', analysis.status !== 'fallback')
    },
  })
}

function analysisCropFor(role) {
  const selection = state.subjectSelections[role]
  return selection?.mode === 'manual' ? selection.rect : null
}

function renderAnalysisProgress(progress, options = {}) {
  state.analysisSteps = progress
  renderStepper(elements.analysisStepper, progress)
  const activeStep = progress.steps?.find((step) => step.key === progress.active)
  const message = options.message || activeStep?.detail || '结构化分析已完成，正在整理复盘报告。'
  elements.analysisLiveMessage.textContent = message
  renderAnalysisMetrics(options.metrics)
  if (options.traceStepId) {
    state.analysisTrace = upsertAnalysisTrace(state.analysisTrace, {
      stepId: options.traceStepId,
      message,
      status: options.status || (progress.active ? 'active' : 'complete'),
    })
  }
  renderAnalysisTrace()
}

function renderAnalysisMetrics(metrics) {
  const hasMetrics = metrics
    && typeof metrics === 'object'
    && metrics.stage === 'pose'
    && metrics.kind
    && Number.isFinite(Number(metrics.sampledFrames))
  elements.analysisRealProgress.classList.toggle('hidden', !hasMetrics)
  elements.analysisFrameStats.classList.toggle('hidden', !hasMetrics)
  if (!hasMetrics) return

  const roleLabel = metrics.kind === 'teacher' ? '老师视频' : '我的视频'
  const progressPercent = Number(metrics.progressPercent)
  if (Number.isFinite(progressPercent)) {
    elements.analysisRealProgress.value = Math.max(0, Math.min(100, progressPercent))
    elements.analysisRealProgress.setAttribute('aria-label', `${roleLabel}姿态识别进度 ${Math.round(progressPercent)}%`)
  }
  elements.analysisFrameStats.textContent = `${roleLabel}：已检测 ${metrics.sampledFrames || 0} 帧 · 有效姿态 ${metrics.validPoseFrames || 0} 帧`
}

function renderAnalysisTrace() {
  const trace = state.analysisTrace.length
    ? state.analysisTrace
    : [{ stepId: 'pending', label: '准备任务', message: '正在准备分析任务…', status: 'pending' }]
  const html = `<ol class="analysis-trace-list">${trace
    .map((item) => {
      const status = item.status || 'pending'
      return `<li class="analysis-trace-item trace-${escapeHtml(status)}" data-trace-step-id="${escapeHtml(item.stepId)}"><span class="trace-status-dot" aria-hidden="true"></span><div class="trace-copy"><div class="trace-heading"><strong>${escapeHtml(item.label)}</strong><span class="trace-state">${escapeHtml(traceStatusLabel(status))}</span></div><p>${escapeHtml(item.message)}</p></div></li>`
    })
    .join('')}</ol>`
  elements.analysisErrorTraceContent.innerHTML = html
  elements.analysisErrorTrace.classList.toggle('hidden', state.errorContext !== 'analysis')
}

function mapPoseAnalysisProgress(update) {
  const message = typeof update === 'string' ? update : update?.message
  if (update?.stage === 'model') {
    return { active: 'keyframes', completed: [], steps: ANALYSIS_STEPS }
  }
  if (update?.stage === 'difference') {
    return { active: 'difference', completed: ['keyframes', 'pose'], steps: ANALYSIS_STEPS }
  }
  if (update?.stage === 'pose') {
    return { active: 'pose', completed: ['keyframes'], steps: ANALYSIS_STEPS }
  }
  if (String(message).includes('加载')) {
    return { active: 'keyframes', completed: [], steps: ANALYSIS_STEPS }
  }
  if (String(message).includes('识别') || String(message).includes('帧姿态')) {
    return { active: 'pose', completed: ['keyframes'], steps: ANALYSIS_STEPS }
  }
  return { active: 'difference', completed: ['keyframes', 'pose'], steps: ANALYSIS_STEPS }
}

function analysisFailureStep(error) {
  if (String(error?.code || '').startsWith('pose_')) return 'pose'
  return state.analysisSteps.active || 'difference'
}

function analysisFailureTraceStep(error) {
  const code = String(error?.code || '')
  if (code === 'pose_model_load_failed') return 'model'
  if (code.startsWith('pose_')) return error?.role === 'teacher' ? 'pose-teacher' : 'pose-user'
  if (state.analysisSteps.active === 'coach') return 'coach'
  return 'difference'
}

function mapApiAnalysisProgress(analysis) {
  const completed = ['keyframes', 'pose']
  let active = 'difference'

  if (analysis.stage === 'structured_analysis') {
    active = 'difference'
  } else if (analysis.stage === 'model_summarizing') {
    completed.push('difference')
    active = 'coach'
  } else if (analysis.status === 'success' || analysis.status === 'fallback') {
    completed.push('difference', 'coach')
    active = null
  }

  return { active, completed, steps: ANALYSIS_STEPS }
}

function mapApiTraceUpdate(analysis) {
  if (analysis.status === 'success' || analysis.status === 'fallback') {
    return {
      traceStepId: 'coach',
      status: 'complete',
      message: analysis.status === 'fallback'
        ? '模型服务不可用，已根据真实结构化差异生成可执行的本地兜底复盘。'
        : '已根据真实结构化动作差异生成复盘建议。',
    }
  }
  if (analysis.stage === 'model_summarizing') {
    return {
      traceStepId: 'coach',
      status: 'active',
      message: '正在根据结构化动作差异生成复盘建议。',
    }
  }
  return {
    traceStepId: 'difference',
    status: 'complete',
    message: '结构化动作差异已经提交，等待复盘生成。',
  }
}

function renderReport() {
  const report = state.report
  elements.coachSummaryTitle.textContent = report.title
  elements.coachSummaryText.textContent = report.aiSummary
  elements.issueCount.textContent = `${report.mismatches.length} 个差异节点`
  elements.reportTitle.textContent = report.fallback ? '这一遍的结构化复盘' : '这一遍的复盘'
  elements.practiceSteps.innerHTML = report.drillPlan.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')
  elements.reviewTips.innerHTML = report.reviewAdvice.map((tip) => `<p><span>✓</span>${escapeHtml(tip)}</p>`).join('')
  elements.safetyNote.textContent = report.safetyNote
  renderAnalysisTrace()
  renderIssueList()
  renderTrackingGap()
  renderTimeline()
}

function renderIssueList() {
  elements.reportIssueList.innerHTML = state.report.mismatches
    .map((issue, index) => renderIssueCard(issue, index, {
      active: index === state.activeMismatchIndex,
      expanded: state.expandedMismatchIds.includes(issue.id),
    }))
    .join('')
}

function renderTrackingGap() {
  const gaps = state.report.trackingGaps || []
  elements.trackingGapMessage.classList.toggle('hidden', gaps.length === 0)
  elements.trackingGapMessage.innerHTML = gaps.length
    ? `<strong>有一段画面没有稳定识别到完整身体</strong><p>${escapeHtml(gaps[0].message)}。这一段不会生成具体动作结论，你可以重新选人、重新校准或更换视频。</p>`
    : ''
}

function jumpToIssue(index) {
  const issue = state.report?.mismatches?.[index]
  if (!issue) return
  state.activeMismatchIndex = index
  seekCommonTime(issue.startTime)
  renderIssueList()
  renderTimeline()
  document.querySelector(`[data-issue-index="${index}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function toggleIssue(index) {
  const issue = state.report?.mismatches?.[index]
  if (!issue) return
  state.expandedMismatchIds = toggleExpandedMismatchId(state.expandedMismatchIds, issue.id)
  jumpToIssue(index)
}

function requestReplaceVideo(role) {
  openConfirmation({
    title: '更换这段视频？',
    message: '当前准备或分析会自动取消，已完成的校准和报告也会清除。',
    actionLabel: '更换视频',
    danger: false,
    onConfirm() {
      abortActiveTask()
      clearResults({ preserveSession: true })
      removeVideo(role)
      setStage('upload')
      getVideoInput(role).click()
    },
  })
}

function removeVideo(role) {
  const asset = state.videos[role]
  uploadControllers.get(role)?.abort()
  uploadControllers.delete(role)
  if (asset?.serverId && state.sessionToken) {
    comparisonApi.deleteVideo(asset.serverId, state.sessionToken).catch(() => {})
  }
  revokeAssetUrl(asset)
  state.videos[role] = null
  getVideoInput(role).value = ''
  renderUploadState()
}

function requestReturnUpload() {
  openConfirmation({
    title: '更换视频并开始新分析？',
    message: '当前报告不会被保存。返回后可以重新上传两段视频。',
    actionLabel: '返回上传页',
    danger: false,
    onConfirm() {
      abortActiveTask()
      clearResults({ preserveSession: true })
      setStage('upload')
    },
  })
}

function requestDeleteData() {
  closePrivacy()
  openConfirmation({
    title: '删除本次数据？',
    message: '两段视频、人物选择和本次复盘都会从当前页面清除，且无法恢复。',
    actionLabel: '确认删除',
    danger: true,
    async onConfirm() {
      elements.confirmAction.disabled = true
      elements.confirmAction.textContent = '正在删除…'
      try {
        await deleteCurrentSessionData()
        resetAllData()
        closeConfirmation()
        showToast('本次数据已删除')
      } catch (error) {
        elements.confirmAction.disabled = false
        elements.confirmAction.textContent = '重新删除'
        showToast(error.message || '删除失败，请稍后重试', 'error')
      }
    },
  })
}

function openPrivacy() {
  elements.privacyBackdrop.classList.remove('hidden')
  document.body.classList.add('modal-open')
  elements.privacyClose.focus()
}

function closePrivacy() {
  elements.privacyBackdrop.classList.add('hidden')
  document.body.classList.remove('modal-open')
}

function openConfirmation({ title, message, actionLabel, danger, onConfirm }) {
  pendingConfirmation = onConfirm
  elements.confirmTitle.textContent = title
  elements.confirmMessage.textContent = message
  elements.confirmAction.textContent = actionLabel
  elements.confirmAction.disabled = false
  elements.confirmAction.classList.toggle('danger', danger)
  elements.confirmAction.classList.toggle('primary', !danger)
  elements.confirmIcon.textContent = danger ? '!' : '↗'
  elements.confirmBackdrop.classList.remove('hidden')
  document.body.classList.add('modal-open')
  elements.confirmCancel.focus()
}

function closeConfirmation() {
  pendingConfirmation = null
  elements.confirmBackdrop.classList.add('hidden')
  document.body.classList.remove('modal-open')
}

function showToast(message, type = 'success') {
  window.clearTimeout(toastTimer)
  elements.toast.classList.remove('hidden', 'error')
  elements.toast.classList.toggle('error', type === 'error')
  elements.toast.querySelector('span').textContent = type === 'error' ? '!' : '✓'
  elements.toast.querySelector('p').textContent = message
  toastTimer = window.setTimeout(() => elements.toast.classList.add('hidden'), 3200)
}

function clearResults(options = {}) {
  stopPlayback()
  disposePosePlaybackRenderers()
  if (!options.preserveSession) {
    state.sessionId = null
    state.sessionToken = null
    sessionPromise = null
  }
  state.analysisTaskId = null
  state.subjectSelections = { teacher: null, user: null }
  state.subjectStep = 'teacher'
  state.alignment = null
  state.manualAnchors = { teacher: null, user: null }
  state.report = null
  state.poseAnalysis = null
  state.poseFrames = null
  state.analysisTrace = []
  state.errorContext = null
  state.activeMismatchIndex = -1
  state.expandedMismatchIds = []
  state.commonTime = 0
  state.error = null
}

function resetAllData() {
  abortActiveTask()
  for (const controller of uploadControllers.values()) controller.abort()
  uploadControllers.clear()
  sessionPromise = null
  revokeAllAssetUrls()
  Object.assign(state, createInitialAppState())
  for (const input of [elements.teacherVideoInput, elements.userVideoInput]) input.value = ''
  for (const video of [elements.teacherCompareVideo, elements.userCompareVideo]) {
    video.removeAttribute('src')
    video.load()
  }
  renderUploadState()
  setStage('upload')
}

function abortActiveTask() {
  const taskId = state.analysisTaskId
  const sessionToken = state.sessionToken
  activeController?.abort()
  activeController = null
  state.analysisTaskId = null
  if (taskId && sessionToken) {
    comparisonApi.cancelAnalysis(taskId, sessionToken).catch(() => {})
  }
  disposePosePlaybackRenderers()
  stopPlayback()
}

function deleteCurrentSessionData() {
  if (!state.sessionToken) return Promise.resolve()
  return comparisonApi.deleteSession(state.sessionId, state.sessionToken)
}

function revokeAllAssetUrls() {
  revokeAssetUrl(state.videos.teacher)
  revokeAssetUrl(state.videos.user)
}

function revokeAssetUrl(asset) {
  if (asset?.source === 'local' && asset.url) URL.revokeObjectURL(asset.url)
}

function getVideoInput(role) {
  return role === 'teacher' ? elements.teacherVideoInput : elements.userVideoInput
}

function getComparisonDuration() {
  return Number(state.alignment?.timeline?.duration)
    || Number(state.alignment?.duration)
    || Math.min(state.videos.teacher?.duration || 0, state.videos.user?.duration || 0)
}

function readVideoMetadata(url, file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    let settled = false
    const timeout = window.setTimeout(() => {
      finishReject(createVideoReadError(file, null, 'timeout'))
    }, VIDEO_METADATA_TIMEOUT_MS)

    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.preload = 'metadata'
    video.style.position = 'fixed'
    video.style.left = '-9999px'
    video.style.width = '1px'
    video.style.height = '1px'
    video.style.opacity = '0'
    video.style.pointerEvents = 'none'

    const cleanup = () => {
      window.clearTimeout(timeout)
      video.removeEventListener('loadedmetadata', handleMetadata)
      video.removeEventListener('durationchange', handleMetadata)
      video.removeEventListener('error', handleError)
      video.remove()
    }
    const finishResolve = (metadata) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(metadata)
    }
    function finishReject(error) {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    function handleMetadata() {
      const duration = Number(video.duration)
      if (!Number.isFinite(duration) || duration <= 0) return
      finishResolve({
        duration,
        width: Number(video.videoWidth) || 0,
        height: Number(video.videoHeight) || 0,
      })
    }
    function handleError() {
      finishReject(createVideoReadError(file, video.error))
    }

    video.addEventListener('loadedmetadata', handleMetadata)
    video.addEventListener('durationchange', handleMetadata)
    video.addEventListener('error', handleError)
    document.body.append(video)
    video.src = url
    video.load()
  })
}

function createVideoReadError(file, mediaError, reason = '') {
  const error = new Error('video-read-failed')
  const extension = String(file?.name || '').split('.').pop()?.toUpperCase() || '视频'
  const code = Number(mediaError?.code) || 0

  if (reason === 'timeout') {
    error.userMessage = `读取 ${extension} 视频超时。请保持页面在前台后重试，或换一段更短的 H.264 MP4。`
  } else if (code === 3 || code === 4) {
    error.userMessage = `当前手机浏览器无法解码这段 ${extension} 视频。请改用 H.264 视频编码、AAC 音频的 MP4；MOV / HEVC 需要转码后再试。`
  } else if (code === 2) {
    error.userMessage = '读取视频时被浏览器中断，请保持页面在前台并重新选择。'
  } else {
    error.userMessage = `无法读取这段 ${extension} 视频。请重新选择，或先转换为 H.264 + AAC 的 MP4。`
  }

  return error
}

function holdAnalysisResult(duration, signal) {
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    const abort = () => {
      window.clearTimeout(timer)
      const error = new Error('动作分析已取消')
      error.name = 'AbortError'
      reject(error)
    }
    const timer = window.setTimeout(finish, duration)
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
  })
}

function handleVideoPlaybackError(role, video) {
  const asset = state.videos[role]
  if (!asset || asset.source !== 'local' || !video.error) return
  const error = createVideoReadError(asset.file, video.error)
  asset.playbackError = true
  asset.message = error.userMessage
  renderUploadState()
  showToast(`${role === 'teacher' ? '老师' : '我的'}视频无法在当前浏览器播放`, 'error')
}

function formatFileSize(bytes) {
  if (Number(bytes) < 1024 * 1024) return `${Math.round(Number(bytes) / 1024)} KB`
  return `${(Number(bytes) / (1024 * 1024)).toFixed(1)} MB`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatDuration(seconds) {
  return `${Math.max(1, Math.round(Number(seconds) || 0))} 秒`
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0)
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = Math.floor(safeSeconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function bindEvents() {
  document.querySelectorAll('[data-pick-video]').forEach((button) => {
    button.addEventListener('click', () => getVideoInput(button.dataset.pickVideo).click())
  })
  elements.teacherVideoInput.addEventListener('change', async (event) => {
    await loadVideoFile('teacher', event.target.files[0])
    event.target.value = ''
  })
  elements.userVideoInput.addEventListener('change', async (event) => {
    await loadVideoFile('user', event.target.files[0])
    event.target.value = ''
  })
  document.querySelector('[data-upload-card="teacher"] video').addEventListener('error', (event) => handleVideoPlaybackError('teacher', event.currentTarget))
  document.querySelector('[data-upload-card="user"] video').addEventListener('error', (event) => handleVideoPlaybackError('user', event.currentTarget))
  elements.teacherCompareVideo.addEventListener('error', (event) => handleVideoPlaybackError('teacher', event.currentTarget))
  elements.userCompareVideo.addEventListener('error', (event) => handleVideoPlaybackError('user', event.currentTarget))
  document.querySelectorAll('[data-remove-video]').forEach((button) => button.addEventListener('click', () => removeVideo(button.dataset.removeVideo)))
  document.querySelectorAll('[data-retry-upload]').forEach((button) => button.addEventListener('click', () => retryUpload(button.dataset.retryUpload)))
  document.querySelectorAll('[data-replace-during-task]').forEach((button) => button.addEventListener('click', () => requestReplaceVideo(button.dataset.replaceDuringTask)))
  document.querySelectorAll('[data-return-upload]').forEach((button) => button.addEventListener('click', requestReturnUpload))
  elements.startProcessing.addEventListener('click', startProcessing)
  elements.candidateGrid.addEventListener('click', (event) => {
    const candidate = event.target.closest('[data-candidate-id]')
    if (candidate) selectSubject(candidate.dataset.candidateId)
  })
  elements.confirmSubject.addEventListener('click', confirmSubject)
  elements.manualSubjectBox.addEventListener('click', openSubjectCrop)
  elements.cropClose.addEventListener('click', closeSubjectCrop)
  elements.cropCancel.addEventListener('click', closeSubjectCrop)
  elements.cropReset.addEventListener('click', resetCropDraft)
  elements.cropConfirm.addEventListener('click', confirmSubjectCrop)
  elements.cropStage.addEventListener('pointerdown', startCropPointer)
  elements.cropStage.addEventListener('pointermove', moveCropPointer)
  elements.cropStage.addEventListener('pointerup', endCropPointer)
  elements.cropStage.addEventListener('pointercancel', cancelCropPointer)
  document.querySelectorAll('[data-set-anchor]').forEach((button) => button.addEventListener('click', () => setManualAnchor(button.dataset.setAnchor)))
  elements.confirmAlignment.addEventListener('click', confirmManualAlignment)
  elements.retryAutoAlignment.addEventListener('click', () => {
    state.alignment = createReadyAlignment(1.2)
    showToast('重新尝试成功，音乐已经对齐')
    setStage('ready')
  })
  elements.sharedProgress.addEventListener('input', (event) => seekCommonTime(event.target.value))
  elements.sharedPlay.addEventListener('click', togglePlayback)
  elements.stepBack.addEventListener('click', () => seekCommonTime(state.commonTime - PLAYBACK_STEP_SEC))
  elements.stepForward.addEventListener('click', () => seekCommonTime(state.commonTime + PLAYBACK_STEP_SEC))
  elements.playbackRate.addEventListener('click', cyclePlaybackRate)
  elements.timelineOverlay.addEventListener('click', (event) => {
    const marker = event.target.closest('[data-marker-index]')
    if (marker) jumpToIssue(Number(marker.dataset.markerIndex))
  })
  elements.startAnalysis.addEventListener('click', () => startAnalysis())
  elements.cancelAnalysis.addEventListener('click', () => {
    abortActiveTask()
    setStage('ready')
    showToast('已取消本次分析')
  })
  elements.reselectSubject.addEventListener('click', () => {
    state.subjectStep = 'teacher'
    renderSubjectSelection()
    setStage('subject-selection')
  })
  elements.reportIssueList.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-toggle-issue]')
    if (trigger) toggleIssue(Number(trigger.dataset.toggleIssue))
  })
  elements.deleteFromReport.addEventListener('click', requestDeleteData)
  elements.retryFromError.addEventListener('click', retryCurrentTask)
  elements.privacyOpen?.addEventListener('click', openPrivacy)
  elements.footerPrivacy?.addEventListener('click', openPrivacy)
  elements.privacyClose.addEventListener('click', closePrivacy)
  elements.privacyDone.addEventListener('click', closePrivacy)
  elements.privacyBackdrop.addEventListener('click', (event) => {
    if (event.target === elements.privacyBackdrop) closePrivacy()
  })
  elements.deleteSession.addEventListener('click', requestDeleteData)
  elements.confirmCancel.addEventListener('click', closeConfirmation)
  elements.confirmAction.addEventListener('click', async () => {
    const action = pendingConfirmation
    if (!action) return
    await action()
    if (!elements.confirmAction.disabled) closeConfirmation()
  })
  elements.confirmBackdrop.addEventListener('click', (event) => {
    if (event.target === elements.confirmBackdrop) closeConfirmation()
  })
  document.querySelector('.brand').addEventListener('click', (event) => {
    event.preventDefault()
    if (state.stage === 'upload') return
    requestReturnUpload()
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!elements.confirmBackdrop.classList.contains('hidden')) closeConfirmation()
      else if (!elements.privacyBackdrop.classList.contains('hidden')) closePrivacy()
    }
  })
  window.addEventListener('resize', renderVisibleSubjectLocks, { passive: true })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.cropBackdrop.classList.contains('hidden')) closeSubjectCrop()
  })
  window.addEventListener('beforeunload', () => {
    abortActiveTask()
    revokeAllAssetUrls()
  })
}

function retryCurrentTask() {
  if (state.errorContext === 'analysis') {
    startAnalysis({ isRetry: true })
    return
  }
  startProcessing()
}

function initialize() {
  bindEvents()
  renderUploadState()
  setStage('upload', { focus: false })
}

function cyclePlaybackRate() {
  const currentRate = Number(elements.playbackRate.dataset.rate) || 1
  const currentIndex = PLAYBACK_RATES.indexOf(currentRate)
  const nextRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length]
  elements.playbackRate.dataset.rate = String(nextRate)
  elements.playbackRate.textContent = `速度 ${nextRate}×`
  videoPlayback.setPlaybackRate(nextRate)
}

initialize()
