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

function drawPoseFrame(canvas, video, frame, options = {}) {
  if (!canvas || !video || !frame?.landmarks) return

  syncPoseCanvasSize(canvas)

  const ctx = canvas.getContext('2d')
  const color = options.color || DEFAULT_COLOR
  const rect = getVideoContentRect(canvas, video)

  ctx.clearRect(0, 0, canvas.width, canvas.height)
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
  const scale = window.devicePixelRatio || 1
  const width = Math.max(1, Math.round(rect.width * scale))
  const height = Math.max(1, Math.round(rect.height * scale))

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
}

function getVideoContentRect(canvas, video) {
  const canvasRatio = canvas.width / canvas.height
  const videoRatio = (video.videoWidth || canvas.width) / (video.videoHeight || canvas.height)

  if (videoRatio > canvasRatio) {
    const height = canvas.width / videoRatio
    return {
      x: 0,
      y: (canvas.height - height) / 2,
      width: canvas.width,
      height,
    }
  }

  const width = canvas.height * videoRatio
  return {
    x: (canvas.width - width) / 2,
    y: 0,
    width,
    height: canvas.height,
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
  drawPoseFrame,
  clearPoseCanvas,
  syncPoseCanvasSize,
}
