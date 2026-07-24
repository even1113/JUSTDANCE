import { VISIBILITY_THRESHOLD } from '../services/poseNormalizer.js'

const POSE_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  [9, 10],
  [11, 12],
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [17, 19],
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [18, 20],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [24, 26],
  [25, 27],
  [26, 28],
  [27, 29],
  [28, 30],
  [29, 31],
  [30, 32],
  [27, 31],
  [28, 32],
]

const DEFAULT_COLOR = '#b7f34a'
const TRAIL_LANDMARKS = [15, 16, 27, 28]
const DEFAULT_TRAIL_WINDOW_SEC = 0.85
const MAX_TRAIL_FRAMES = 30
const MAX_CANVAS_DPR = 2

function drawPoseFrame(canvas, video, frame, options = {}) {
  if (!canvas || !video || !frame?.landmarks) return

  if (options.syncSize !== false) syncPoseCanvasSize(canvas)

  const ctx = canvas.getContext('2d')
  const color = options.color || DEFAULT_COLOR
  const rect = getVideoContentRect(canvas, video)

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  drawTrajectories(ctx, rect, options.history || [], color)
  drawConnections(ctx, rect, frame.landmarks, color)
  drawLandmarks(ctx, rect, frame.landmarks, color)
}

function clearPoseCanvas(canvas) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

function syncPoseCanvasSize(canvas) {
  const rect = canvas.getBoundingClientRect()
  const scale = Math.min(MAX_CANVAS_DPR, window.devicePixelRatio || 1)
  const width = Math.max(1, Math.round(rect.width * scale))
  const height = Math.max(1, Math.round(rect.height * scale))

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
}

function getVideoContentRect(canvas, video) {
  return getContainedContentRect(
    canvas.width,
    canvas.height,
    video.videoWidth || canvas.width,
    video.videoHeight || canvas.height,
  )
}

function getContainedContentRect(containerWidth, containerHeight, contentWidth, contentHeight) {
  const safeContainerWidth = Math.max(1, Number(containerWidth) || 1)
  const safeContainerHeight = Math.max(1, Number(containerHeight) || 1)
  const safeContentWidth = Math.max(1, Number(contentWidth) || 1)
  const safeContentHeight = Math.max(1, Number(contentHeight) || 1)
  const containerRatio = safeContainerWidth / safeContainerHeight
  const contentRatio = safeContentWidth / safeContentHeight

  if (contentRatio > containerRatio) {
    const height = safeContainerWidth / contentRatio
    return {
      x: 0,
      y: (safeContainerHeight - height) / 2,
      width: safeContainerWidth,
      height,
    }
  }

  const width = safeContainerHeight * contentRatio
  return {
    x: (safeContainerWidth - width) / 2,
    y: 0,
    width,
    height: safeContainerHeight,
  }
}

function drawConnections(ctx, rect, landmarks, color) {
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  POSE_CONNECTIONS.forEach(([startIndex, endIndex]) => {
    const start = landmarks[startIndex]
    const end = landmarks[endIndex]

    if (!isDrawable(start) || !isDrawable(end)) return

    const alpha = Math.min(start.visibility ?? 1, end.visibility ?? 1) >= VISIBILITY_THRESHOLD ? 0.82 : 0.24
    const startPoint = toCanvasPoint(rect, start)
    const endPoint = toCanvasPoint(rect, end)

    ctx.strokeStyle = withAlpha(color, alpha)
    ctx.beginPath()
    ctx.moveTo(startPoint.x, startPoint.y)
    ctx.lineTo(endPoint.x, endPoint.y)
    ctx.stroke()
  })
}

function drawTrajectories(ctx, rect, history, color) {
  if (history.length < 2) return

  TRAIL_LANDMARKS.forEach((landmarkIndex) => {
    for (let index = 1; index < history.length; index++) {
      const previousFrame = history[index - 1]
      const currentFrame = history[index]
      const previous = previousFrame.landmarks?.[landmarkIndex]
      const current = currentFrame.landmarks?.[landmarkIndex]
      const timeGap = Number(currentFrame.timestamp) - Number(previousFrame.timestamp)

      if (!isVisible(previous) || !isVisible(current) || timeGap > 0.3) continue

      const previousPoint = toCanvasPoint(rect, previous)
      const currentPoint = toCanvasPoint(rect, current)
      const progress = index / Math.max(1, history.length - 1)
      ctx.strokeStyle = withAlpha(color, 0.08 + progress * 0.48)
      ctx.lineWidth = 1.4 + progress * 2.2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(previousPoint.x, previousPoint.y)
      ctx.lineTo(currentPoint.x, currentPoint.y)
      ctx.stroke()
    }
  })
}

function drawLandmarks(ctx, rect, landmarks, color) {
  landmarks.forEach((landmark) => {
    if (!isDrawable(landmark)) return

    const alpha = (landmark.visibility ?? 1) >= VISIBILITY_THRESHOLD ? 0.95 : 0.22
    const point = toCanvasPoint(rect, landmark)
    const radius = (landmark.visibility ?? 1) >= VISIBILITY_THRESHOLD ? 4.2 : 2.6

    ctx.fillStyle = withAlpha(color, alpha)
    ctx.beginPath()
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
    ctx.fill()
  })
}

function toCanvasPoint(rect, landmark) {
  return {
    x: rect.x + landmark.x * rect.width,
    y: rect.y + landmark.y * rect.height,
  }
}

function isDrawable(landmark) {
  return landmark
    && Number.isFinite(landmark.x)
    && Number.isFinite(landmark.y)
}

function isVisible(landmark) {
  return isDrawable(landmark) && (landmark.visibility ?? 1) >= VISIBILITY_THRESHOLD
}

function getPoseTrailFrames(frames, timestamp, options = {}) {
  if (!Array.isArray(frames) || frames.length === 0) return []
  const windowSec = Math.max(0.1, Number(options.windowSec) || DEFAULT_TRAIL_WINDOW_SEC)
  const maxFrames = Math.max(2, Number(options.maxFrames) || MAX_TRAIL_FRAMES)
  const startTime = Number(timestamp) - windowSec
  const endTime = Number(timestamp) + 0.01
  const startIndex = findFrameIndex(frames, startTime, false)
  const endIndex = findFrameIndex(frames, endTime, true)
  return frames.slice(Math.max(startIndex, endIndex - maxFrames), endIndex)
}

function findFrameIndex(frames, timestamp, afterEqual) {
  let low = 0
  let high = frames.length

  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    const frameTime = Number(frames[middle]?.timestamp)
    if (frameTime < timestamp || (afterEqual && frameTime <= timestamp)) low = middle + 1
    else high = middle
  }
  return low
}

function withAlpha(color, alpha) {
  const rgb = hexToRgb(color)
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${alpha})`
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3
    ? normalized.split('').map((item) => item + item).join('')
    : normalized

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

export {
  POSE_CONNECTIONS,
  TRAIL_LANDMARKS,
  MAX_CANVAS_DPR,
  drawPoseFrame,
  clearPoseCanvas,
  getContainedContentRect,
  getPoseTrailFrames,
  getVideoContentRect,
  syncPoseCanvasSize,
}
