import { createIndependentVideoPlayback } from './hooks/useIndependentVideoPlayback.js'
import { alignAudioTracks, createManualAudioAlignment } from './services/audioAlignment.js'
import {
  canStartAnalysis,
  canStartProcessing,
  createInitialAppState,
  getActiveMismatchIndex,
  nextTaskVersion,
  validateVideoDuration,
  validateVideoFile,
} from './services/appState.js'
import {
  ANALYSIS_STEPS,
  PROCESSING_STEPS,
  analyzeComparison,
  cancelTask,
  createComparisonSession,
  deleteSessionData,
  processVideos,
} from './services/mockComparisonApi.js'
import {
  poseFigure,
  renderCandidateCard,
  renderIssueCard,
} from './components/uiComponents.js'

const REVIEW_MODE = new URLSearchParams(window.location.search).get('review') === '1'
const DEMO_DURATION = 32
const VIDEO_METADATA_TIMEOUT_MS = 20000
const DEFAULT_CROP_RECT = { x: 0.28, y: 0.08, width: 0.44, height: 0.84 }
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
let pendingConfirmation = null
let toastTimer = null
let demoTimer = null
let activeCropRole = null
let cropDraft = { ...DEFAULT_CROP_RECT }
let cropPointerId = null
let cropStartPoint = null

const elements = {
  stageViews: [...document.querySelectorAll('[data-stage]')],
  flowSteps: [...document.querySelectorAll('[data-flow-step]')],
  appMain: document.querySelector('#appMain'),
  teacherVideoInput: document.querySelector('#teacherVideoInput'),
  userVideoInput: document.querySelector('#userVideoInput'),
  startProcessing: document.querySelector('#startProcessing'),
  loadDemoAssets: document.querySelector('#loadDemoAssets'),
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
  cropDemo: document.querySelector('#cropDemo'),
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
  workspaceAlignmentBadge: document.querySelector('#workspaceAlignmentBadge'),
  sharedProgress: document.querySelector('#sharedProgress'),
  timelineOverlay: document.querySelector('#timelineOverlay'),
  sharedTime: document.querySelector('#sharedTime'),
  activeNodeLabel: document.querySelector('#activeNodeLabel'),
  sharedPlay: document.querySelector('#sharedPlay'),
  stepBack: document.querySelector('#stepBack'),
  stepForward: document.querySelector('#stepForward'),
  playbackRate: document.querySelector('#playbackRate'),
  loopSegment: document.querySelector('#loopSegment'),
  startAnalysis: document.querySelector('#startAnalysis'),
  reselectSubject: document.querySelector('#reselectSubject'),
  analysisStepper: document.querySelector('#analysisStepper'),
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
  reviewToolbar: document.querySelector('#reviewToolbar'),
  scenarioSelect: document.querySelector('#scenarioSelect'),
  reviewReset: document.querySelector('#reviewReset'),
}

teacherVideoRef.current = elements.teacherCompareVideo
userVideoRef.current = elements.userCompareVideo

const videoPlayback = createIndependentVideoPlayback({
  teacherVideoRef,
  userVideoRef,
  onTimeUpdate: ({ commonTime }) => updateCommonTime(commonTime),
  onPlaybackChange: ({ isPlaying, loopEnabled }) => {
    state.isPlaying = isPlaying
    elements.sharedPlay.textContent = isPlaying ? 'Ⅱ' : '▶'
    elements.sharedPlay.setAttribute('aria-label', isPlaying ? '暂停双视频' : '播放双视频')
    elements.loopSegment.classList.toggle('active', loopEnabled)
    elements.loopSegment.setAttribute('aria-pressed', String(loopEnabled))
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
  elements.startProcessing.textContent = ready ? '自动准备两段视频' : '请先添加两段视频'
}

function renderUploadCard(role) {
  const asset = state.videos[role]
  const card = document.querySelector(`[data-upload-card="${role}"]`)
  const dropzone = card.querySelector('.upload-dropzone')
  const preview = card.querySelector('.upload-preview')
  const status = card.querySelector('output')
  const video = preview.querySelector('video')
  const demoPose = preview.querySelector('[data-demo-pose]')
  const fieldMessage = card.querySelector('.field-message')

  status.textContent = asset ? '已添加' : '未添加'
  card.classList.remove('has-error')
  dropzone.classList.toggle('hidden', Boolean(asset))
  preview.classList.toggle('hidden', !asset)
  fieldMessage.textContent = asset?.message || ''
  fieldMessage.classList.toggle('error', Boolean(asset?.message))

  if (!asset) {
    video.removeAttribute('src')
    video.load()
    demoPose.classList.add('hidden')
    return
  }

  preview.querySelector('.upload-file-copy strong').textContent = asset.name
  preview.querySelector('.upload-file-copy small').textContent = `${formatFileSize(asset.size)} · ${formatDuration(asset.duration)}`
  if (asset.source === 'demo') {
    video.classList.add('hidden')
    demoPose.classList.remove('hidden')
    demoPose.innerHTML = poseFigure(role, 0)
  } else {
    video.classList.remove('hidden')
    demoPose.classList.add('hidden')
    if (video.src !== asset.url) video.src = asset.url
    primeVideoPreview(video)
  }
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
    }
    renderUploadState()
    showToast(`${role === 'teacher' ? '老师' : '我的'}视频已添加`)
  } catch (error) {
    URL.revokeObjectURL(url)
    setFieldError(role, error.userMessage || '无法读取这个视频，请重新选择 MP4 或 MOV。')
  }
}

function setFieldError(role, message) {
  const card = document.querySelector(`[data-upload-card="${role}"]`)
  const fieldMessage = card.querySelector('.field-message')
  fieldMessage.textContent = message
  fieldMessage.classList.add('error')
  card.classList.add('has-error')
}

function loadDemoAssets() {
  revokeAllAssetUrls()
  state.videos.teacher = {
    role: 'teacher', source: 'demo', name: '老师示范 · Wave 组合.mp4', size: 18.4 * 1024 * 1024, duration: 32,
  }
  state.videos.user = {
    role: 'user', source: 'demo', name: '我的练习 · 第 3 遍.mp4', size: 21.7 * 1024 * 1024, duration: 32,
  }
  renderUploadState()
  showToast('演示素材已准备好，可以开始体验')
}

async function startProcessing() {
  if (!canStartProcessing(state)) return
  abortActiveTask()
  nextTaskVersion(state)
  state.error = null
  state.processingSteps = { active: null, completed: [], steps: PROCESSING_STEPS }
  renderAssetSummary()
  renderStepper(elements.processingStepper, state.processingSteps)
  setStage('processing')
  activeController = new AbortController()

  try {
    const session = await createComparisonSession(state.videos)
    state.sessionId = session.sessionId
    const result = await processVideos({
      scenario: state.scenario,
      signal: activeController.signal,
      onProgress(progress) {
        state.processingSteps = progress
        renderStepper(elements.processingStepper, progress)
        const activeStep = progress.steps.find((step) => step.key === progress.active)
        elements.processingMessage.textContent = activeStep?.detail || '两段视频已经准备完成'
      },
    })

    state.alignment = await resolveAlignment(result.alignment)
    state.subjectStep = 'teacher'
    state.subjectSelections = result.needsSubjectSelection
      ? { teacher: null, user: null }
      : { teacher: 'person-main', user: 'person-main' }

    if (result.needsSubjectSelection) {
      renderSubjectSelection()
      setStage('subject-selection')
    } else if (state.alignment.status === 'manual-required') {
      prepareManualAlignment()
    } else {
      setStage('ready')
    }
  } catch (error) {
    if (error.name === 'AbortError') return
    state.error = error.message || '视频处理服务暂时不可用，请稍后重试。'
    elements.blockingErrorMessage.textContent = state.error
    setStage('blocking-error')
  } finally {
    activeController = null
  }
}

async function resolveAlignment(mockAlignment) {
  if (mockAlignment.status === 'manual-required') return mockAlignment
  const bothLocal = state.videos.teacher?.source === 'local' && state.videos.user?.source === 'local'
  if (!bothLocal) return createReadyAlignment(mockAlignment.offsetSec || 0)

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
    const status = completed.has(step.key) ? 'complete' : progress.active === step.key ? 'active' : ''
    const symbol = completed.has(step.key) ? '✓' : '<span></span>'
    return `<li class="${status}"><i>${symbol}</i><div><strong>${escapeHtml(step.label)}</strong>${step.detail ? `<small>${escapeHtml(step.detail)}</small>` : ''}</div></li>`
  }).join('')
}

function renderSubjectSelection() {
  const role = state.subjectStep
  const isTeacher = role === 'teacher'
  const selected = state.subjectSelections[role]
  const selectedId = getSubjectSelectionId(selected)
  const asset = state.videos[role]
  elements.subjectDescription.textContent = isTeacher
    ? '老师视频里检测到多人，请选择本次需要跟踪的示范者。'
    : '我的视频里也检测到多人，请选择你自己。后续只分析这个人。'
  elements.subjectStepLabel.textContent = isTeacher ? '第 1 步，共 2 步' : '第 2 步，共 2 步'
  document.querySelectorAll('.selection-progress i').forEach((item, index) => item.classList.toggle('active', index <= (isTeacher ? 0 : 1)))
  elements.subjectFrame.innerHTML = renderSubjectFrame({ asset, role, isTeacher, selected })
  elements.candidateGrid.innerHTML = [0, 1, 2].map((index) => renderCandidateCard({
    id: `person-${index + 1}`,
    role,
    index,
    selected: selectedId === `person-${index + 1}`,
    label: index === 1 ? '画面中央' : `人物 ${index + 1}`,
  })).join('')
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
  const media = asset?.source === 'local'
    ? `<video class="subject-source-video" src="${escapeHtml(asset.url)}" muted playsinline preload="metadata" aria-label="${label}人物框选预览"></video>`
    : `<div class="subject-demo-frame">${poseFigure(role, 1)}</div>`
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
  elements.cropVideo.classList.toggle('hidden', asset?.source !== 'local')
  elements.cropDemo.classList.toggle('hidden', asset?.source === 'local')
  cropDraft = getNormalizedSubjectRect(state.subjectSelections[activeCropRole])
  elements.cropHint.textContent = '在人物全身外侧拖动一个框。框选区域会换算到视频原始尺寸，不受手机屏幕缩放影响。'

  if (asset?.source === 'local') {
    elements.cropVideo.src = asset.url
    const handleReady = () => {
      if (Number.isFinite(elements.cropVideo.duration) && elements.cropVideo.duration > 0) {
        elements.cropVideo.currentTime = Math.min(0.05, elements.cropVideo.duration / 2)
      }
      renderCropDraft()
    }
    if (elements.cropVideo.readyState >= 1) handleReady()
    else elements.cropVideo.addEventListener('loadedmetadata', handleReady, { once: true })
  } else {
    elements.cropVideo.removeAttribute('src')
    elements.cropVideo.load()
    elements.cropDemo.innerHTML = poseFigure(activeCropRole, 1)
    window.requestAnimationFrame(renderCropDraft)
  }

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
  document.querySelectorAll('.calibration-video').forEach((frame, index) => {
    frame.innerHTML = poseFigure(index === 0 ? 'teacher' : 'user', index)
  })
  setStage('manual-alignment')
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
    state.videos.teacher?.duration || DEMO_DURATION,
    state.videos.user?.duration || DEMO_DURATION,
  )
  return { ...alignment, method: 'audio', status: 'ready' }
}

function renderWorkspace() {
  const isDemo = state.videos.teacher?.source === 'demo'
  const duration = getComparisonDuration()
  elements.sharedProgress.max = String(duration)
  elements.sharedProgress.value = String(Math.min(state.commonTime, duration))
  elements.workspaceAlignmentBadge.textContent = state.alignment?.method === 'manual' ? '手动校准完成' : '音乐同步完成'

  for (const role of ['teacher', 'user']) {
    const video = role === 'teacher' ? elements.teacherCompareVideo : elements.userCompareVideo
    const demoPose = document.querySelector(`[data-demo-workspace="${role}"]`)
    const asset = state.videos[role]
    if (asset?.source === 'local') {
      video.classList.remove('hidden')
      demoPose.classList.add('hidden')
      if (video.src !== asset.url) video.src = asset.url
    } else {
      video.classList.add('hidden')
      demoPose.classList.remove('hidden')
      demoPose.innerHTML = poseFigure(role, Math.floor(state.commonTime / 4) % 3)
    }
    renderWorkspaceSubjectLock(role)
  }

  if (!isDemo && state.alignment?.timeline) {
    videoPlayback.refresh()
    videoPlayback.setAlignment(state.alignment)
  }
  renderTimeline()
  updateCommonTime(state.commonTime, { skipIssueRender: true })
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
    const width = Math.max(1.5, ((item.endTime - item.startTime) / duration) * 100)
    return `<button class="timeline-marker ${item.severity} ${index === state.activeMismatchIndex ? 'active' : ''}" style="left:${left}%;width:${width}%" type="button" data-marker-index="${index}" aria-label="跳到 ${escapeHtml(item.timestamp)}：${escapeHtml(item.title)}"></button>`
  })
  const gaps = (state.report?.trackingGaps || []).map((gap) => {
    const left = clamp((gap.startTime / duration) * 100, 0, 100)
    const width = Math.max(1.5, ((gap.endTime - gap.startTime) / duration) * 100)
    return `<span class="timeline-gap" style="left:${left}%;width:${width}%" title="${escapeHtml(gap.message)}"></span>`
  })
  elements.timelineOverlay.innerHTML = markers.concat(gaps).join('')
}

async function togglePlayback() {
  const isDemo = state.videos.teacher?.source === 'demo'
  if (isDemo) {
    state.isPlaying ? stopDemoPlayback() : startDemoPlayback()
    return
  }
  try {
    await videoPlayback.playPause()
  } catch (error) {
    showToast(error.message, 'error')
  }
}

function startDemoPlayback() {
  stopDemoPlayback(false)
  state.isPlaying = true
  elements.sharedPlay.textContent = 'Ⅱ'
  elements.sharedPlay.setAttribute('aria-label', '暂停双视频')
  let lastTime = performance.now()
  demoTimer = window.setInterval(() => {
    const now = performance.now()
    const elapsed = ((now - lastTime) / 1000) * Number(elements.playbackRate.value)
    lastTime = now
    const duration = getComparisonDuration()
    let nextTime = state.commonTime + elapsed
    if (elements.loopSegment.getAttribute('aria-pressed') === 'true') {
      const { start, end } = getLoopRange()
      if (nextTime >= end) nextTime = start
    }
    if (nextTime >= duration) {
      updateCommonTime(duration)
      stopDemoPlayback()
      return
    }
    updateCommonTime(nextTime)
  }, 80)
}

function stopDemoPlayback(updateButton = true) {
  window.clearInterval(demoTimer)
  demoTimer = null
  state.isPlaying = false
  if (updateButton) {
    elements.sharedPlay.textContent = '▶'
    elements.sharedPlay.setAttribute('aria-label', '播放双视频')
  }
}

function stopPlayback() {
  stopDemoPlayback()
  videoPlayback.pauseAll()
}

function seekCommonTime(time) {
  const nextTime = clamp(Number(time), 0, getComparisonDuration())
  if (state.videos.teacher?.source === 'demo') updateCommonTime(nextTime)
  else videoPlayback.seekCommon(nextTime)
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

  if (state.videos.teacher?.source === 'demo' && (state.stage === 'ready' || state.stage === 'report')) {
    document.querySelectorAll('[data-demo-workspace]').forEach((pose) => {
      pose.innerHTML = poseFigure(pose.dataset.demoWorkspace, Math.floor(state.commonTime / 4) % 3)
    })
  }
}

function toggleLoop() {
  const enabled = elements.loopSegment.getAttribute('aria-pressed') !== 'true'
  elements.loopSegment.setAttribute('aria-pressed', String(enabled))
  elements.loopSegment.classList.toggle('active', enabled)
  if (state.videos.teacher?.source !== 'demo') videoPlayback.setLoop(enabled, state.commonTime, 4)
}

function getLoopRange() {
  const issue = state.report?.mismatches?.[state.activeMismatchIndex]
  if (issue) return { start: issue.startTime, end: issue.endTime }
  const duration = getComparisonDuration()
  const start = clamp(state.commonTime - 2, 0, Math.max(0, duration - 4))
  return { start, end: Math.min(duration, start + 4) }
}

async function startAnalysis() {
  if (!canStartAnalysis(state)) {
    showToast('请先完成目标人物确认和视频校准', 'error')
    return
  }
  abortActiveTask()
  nextTaskVersion(state)
  state.analysisSteps = { active: null, completed: [], steps: ANALYSIS_STEPS }
  renderStepper(elements.analysisStepper, state.analysisSteps)
  elements.analysisFallback.classList.toggle('hidden', state.scenario !== 'model-fallback')
  setStage('analyzing')
  activeController = new AbortController()

  try {
    state.report = await analyzeComparison({
      scenario: state.scenario,
      signal: activeController.signal,
      onProgress(progress) {
        state.analysisSteps = progress
        renderStepper(elements.analysisStepper, progress)
      },
    })
    state.activeMismatchIndex = 0
    state.commonTime = state.report.mismatches[0]?.startTime || 0
    renderReport()
    setStage('report')
  } catch (error) {
    if (error.name === 'AbortError') return
    state.error = error.message || '动作分析没有完成，请稍后重试。'
    elements.blockingErrorMessage.textContent = state.error
    setStage('blocking-error')
  } finally {
    activeController = null
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
  renderIssueList()
  renderTrackingGap()
  renderTimeline()
}

function renderIssueList() {
  elements.reportIssueList.innerHTML = state.report.mismatches
    .map((issue, index) => renderIssueCard(issue, index, index === state.activeMismatchIndex))
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

function requestReplaceVideo(role) {
  openConfirmation({
    title: '更换这段视频？',
    message: '当前准备或分析会自动取消，已完成的校准和报告也会清除。',
    actionLabel: '更换视频',
    danger: false,
    onConfirm() {
      abortActiveTask()
      clearResults()
      removeVideo(role)
      setStage('upload')
      getVideoInput(role).click()
    },
  })
}

function removeVideo(role) {
  revokeAssetUrl(state.videos[role])
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
      clearResults()
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
      await deleteSessionData(state.sessionId)
      resetAllData()
      closeConfirmation()
      showToast('本次数据已删除')
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

function clearResults() {
  stopPlayback()
  state.sessionId = null
  state.subjectSelections = { teacher: null, user: null }
  state.subjectStep = 'teacher'
  state.alignment = null
  state.manualAnchors = { teacher: null, user: null }
  state.report = null
  state.activeMismatchIndex = -1
  state.commonTime = 0
  state.error = null
}

function resetAllData() {
  abortActiveTask()
  revokeAllAssetUrls()
  const scenario = state.scenario
  Object.assign(state, createInitialAppState(), { scenario })
  for (const input of [elements.teacherVideoInput, elements.userVideoInput]) input.value = ''
  for (const video of [elements.teacherCompareVideo, elements.userCompareVideo]) {
    video.removeAttribute('src')
    video.load()
  }
  renderUploadState()
  setStage('upload')
}

function abortActiveTask() {
  cancelTask(activeController)
  activeController = null
  stopPlayback()
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
    || Math.min(state.videos.teacher?.duration || DEMO_DURATION, state.videos.user?.duration || DEMO_DURATION)
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
  document.querySelectorAll('[data-replace-during-task]').forEach((button) => button.addEventListener('click', () => requestReplaceVideo(button.dataset.replaceDuringTask)))
  document.querySelectorAll('[data-return-upload]').forEach((button) => button.addEventListener('click', requestReturnUpload))
  elements.startProcessing.addEventListener('click', startProcessing)
  elements.loadDemoAssets.addEventListener('click', loadDemoAssets)
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
  elements.stepBack.addEventListener('click', () => seekCommonTime(state.commonTime - 1 / 30))
  elements.stepForward.addEventListener('click', () => seekCommonTime(state.commonTime + 1 / 30))
  elements.playbackRate.addEventListener('change', (event) => videoPlayback.setPlaybackRate(event.target.value))
  elements.loopSegment.addEventListener('click', toggleLoop)
  elements.timelineOverlay.addEventListener('click', (event) => {
    const marker = event.target.closest('[data-marker-index]')
    if (marker) jumpToIssue(Number(marker.dataset.markerIndex))
  })
  elements.startAnalysis.addEventListener('click', startAnalysis)
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
    const trigger = event.target.closest('[data-jump-issue]')
    if (trigger) jumpToIssue(Number(trigger.dataset.jumpIssue))
  })
  elements.deleteFromReport.addEventListener('click', requestDeleteData)
  elements.retryFromError.addEventListener('click', startProcessing)
  elements.privacyOpen.addEventListener('click', openPrivacy)
  elements.footerPrivacy.addEventListener('click', openPrivacy)
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
  elements.scenarioSelect.addEventListener('change', (event) => {
    resetAllData()
    state.scenario = event.target.value
    loadDemoAssets()
  })
  elements.reviewReset.addEventListener('click', () => {
    resetAllData()
    loadDemoAssets()
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

function initialize() {
  bindEvents()
  renderUploadState()
  document.querySelectorAll('.calibration-video').forEach((frame, index) => {
    frame.innerHTML = poseFigure(index === 0 ? 'teacher' : 'user', index)
  })
  elements.reviewToolbar.classList.toggle('hidden', !REVIEW_MODE)
  setStage('upload', { focus: false })
}

initialize()
