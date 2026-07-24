const VISIBILITY_THRESHOLD = 0.5
const MIN_SCALE = 0.05
const LANDMARK_COUNT = 33

const LANDMARK_INDEX = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
}

const LEFT_RIGHT_PAIRS = [
  [1, 4],
  [2, 5],
  [3, 6],
  [7, 8],
  [9, 10],
  [11, 12],
  [13, 14],
  [15, 16],
  [17, 18],
  [19, 20],
  [21, 22],
  [23, 24],
  [25, 26],
  [27, 28],
  [29, 30],
  [31, 32],
]

function normalizePoseSequence(frames, options = {}) {
  const {
    mirror = false,
    smoothingWindow = 5,
    maxInterpolationGap = 3,
  } = options

  const prepared = mirror
    ? frames.map((frame) => mirrorPoseFrame(frame))
    : frames.map((frame) => clonePoseFrame(frame))
  const interpolated = interpolateMissingLandmarks(prepared, maxInterpolationGap)
  const normalized = interpolated.map((frame) => normalizePoseFrame(frame))
  const smoothed = smoothNormalizedLandmarks(normalized, smoothingWindow)

  return smoothed.map((frame) => ({
    ...frame,
    angleFeatures: extractAngleFeatures(frame),
  }))
}

function clonePoseFrame(frame) {
  const landmarks = ensureLandmarks(frame.landmarks).map((landmark) => ({ ...landmark }))
  const worldLandmarks = ensureLandmarks(frame.worldLandmarks).map((landmark) => ({ ...landmark }))

  return {
    ...frame,
    landmarks,
    worldLandmarks,
    visibility: landmarks.map((landmark, index) => getVisibility(landmark, frame.visibility?.[index])),
  }
}

function mirrorPoseFrame(frame) {
  const mirrored = clonePoseFrame(frame)
  mirrored.landmarks = mirrorLandmarks(mirrored.landmarks, false)
  mirrored.worldLandmarks = mirrorLandmarks(mirrored.worldLandmarks, true)
  mirrored.visibility = mirrored.landmarks.map((landmark) => landmark.visibility ?? 0)
  return mirrored
}

function mirrorLandmarks(landmarks, isWorldSpace) {
  const result = ensureLandmarks(landmarks).map((landmark) => ({
    ...landmark,
    x: Number.isFinite(landmark.x)
      ? (isWorldSpace ? -landmark.x : 1 - landmark.x)
      : landmark.x,
  }))

  LEFT_RIGHT_PAIRS.forEach(([left, right]) => {
    const temp = result[left]
    result[left] = result[right]
    result[right] = temp
  })

  return result
}

function interpolateMissingLandmarks(frames, maxGap) {
  const result = frames.map((frame) => clonePoseFrame(frame))

  for (let landmarkIndex = 0; landmarkIndex < LANDMARK_COUNT; landmarkIndex++) {
    let cursor = 0

    while (cursor < result.length) {
      if (isVisible(result[cursor].landmarks[landmarkIndex])) {
        cursor++
        continue
      }

      const gapStart = cursor
      const prevIndex = gapStart - 1

      while (cursor < result.length && !isVisible(result[cursor].landmarks[landmarkIndex])) {
        cursor++
      }

      const nextIndex = cursor
      const gapLength = nextIndex - gapStart
      const prev = result[prevIndex]?.landmarks[landmarkIndex]
      const next = result[nextIndex]?.landmarks[landmarkIndex]

      if (!prev || !next || gapLength > maxGap || !isFinitePoint(prev) || !isFinitePoint(next)) {
        continue
      }

      for (let offset = 1; offset <= gapLength; offset++) {
        const ratio = offset / (gapLength + 1)
        const target = result[gapStart + offset - 1].landmarks[landmarkIndex]
        target.x = lerp(prev.x, next.x, ratio)
        target.y = lerp(prev.y, next.y, ratio)
        target.z = lerp(prev.z ?? 0, next.z ?? 0, ratio)
        target.visibility = Math.max(VISIBILITY_THRESHOLD, Math.min(prev.visibility ?? 1, next.visibility ?? 1))
      }
    }
  }

  return result
}

function normalizePoseFrame(frame) {
  const landmarks = ensureLandmarks(frame.landmarks)
  const origin = getHipOrigin(landmarks)
  const scale = getBodyScale(landmarks, origin)

  return {
    ...frame,
    normalizedLandmarks: landmarks.map((landmark, index) => {
      const visibility = getVisibility(landmark, frame.visibility?.[index])

      if (!isFinitePoint(landmark)) {
        return { x: 0, y: 0, z: 0, visibility: 0 }
      }

      return {
        x: (landmark.x - origin.x) / scale,
        y: (landmark.y - origin.y) / scale,
        z: ((landmark.z ?? 0) - (origin.z ?? 0)) / scale,
        visibility,
      }
    }),
  }
}

function getHipOrigin(landmarks) {
  const leftHip = landmarks[LANDMARK_INDEX.leftHip]
  const rightHip = landmarks[LANDMARK_INDEX.rightHip]
  const hipCenter = midpoint(leftHip, rightHip)

  if (hipCenter) return hipCenter

  const visible = landmarks.filter((landmark) => isVisible(landmark))
  if (visible.length === 0) return { x: 0.5, y: 0.5, z: 0 }

  return {
    x: average(visible.map((landmark) => landmark.x)),
    y: average(visible.map((landmark) => landmark.y)),
    z: average(visible.map((landmark) => landmark.z ?? 0)),
  }
}

function getBodyScale(landmarks, origin) {
  const leftShoulder = landmarks[LANDMARK_INDEX.leftShoulder]
  const rightShoulder = landmarks[LANDMARK_INDEX.rightShoulder]
  const shoulderCenter = midpoint(leftShoulder, rightShoulder)
  const shoulderWidth = distance(leftShoulder, rightShoulder)
  const torsoLength = shoulderCenter ? distance(shoulderCenter, origin) : 0
  const visible = landmarks.filter((landmark) => isVisible(landmark))
  const fallbackScale = visible.length > 1 ? getVisibleBodyRange(visible) : MIN_SCALE

  return Math.max(shoulderWidth, torsoLength, fallbackScale, MIN_SCALE)
}

function getVisibleBodyRange(landmarks) {
  const xs = landmarks.map((landmark) => landmark.x)
  const ys = landmarks.map((landmark) => landmark.y)
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
}

function smoothNormalizedLandmarks(frames, windowSize) {
  const radius = Math.max(1, Math.floor(windowSize / 2))

  return frames.map((frame, frameIndex) => {
    const normalizedLandmarks = frame.normalizedLandmarks.map((landmark, landmarkIndex) => {
      let weight = 0
      let x = 0
      let y = 0
      let z = 0

      for (let offset = -radius; offset <= radius; offset++) {
        const candidate = frames[frameIndex + offset]?.normalizedLandmarks[landmarkIndex]
        if (!candidate || candidate.visibility < VISIBILITY_THRESHOLD || !isFinitePoint(candidate)) continue

        const localWeight = candidate.visibility / (1 + Math.abs(offset))
        weight += localWeight
        x += candidate.x * localWeight
        y += candidate.y * localWeight
        z += (candidate.z ?? 0) * localWeight
      }

      if (weight <= 0) return landmark

      return {
        ...landmark,
        x: x / weight,
        y: y / weight,
        z: z / weight,
      }
    })

    return {
      ...frame,
      normalizedLandmarks,
    }
  })
}

function extractAngleFeatures(frame) {
  const landmarks = frame.normalizedLandmarks

  return {
    leftElbow: jointAngle(landmarks, 'leftShoulder', 'leftElbow', 'leftWrist'),
    rightElbow: jointAngle(landmarks, 'rightShoulder', 'rightElbow', 'rightWrist'),
    leftShoulder: jointAngle(landmarks, 'leftElbow', 'leftShoulder', 'leftHip'),
    rightShoulder: jointAngle(landmarks, 'rightElbow', 'rightShoulder', 'rightHip'),
    leftHip: jointAngle(landmarks, 'leftShoulder', 'leftHip', 'leftKnee'),
    rightHip: jointAngle(landmarks, 'rightShoulder', 'rightHip', 'rightKnee'),
    leftKnee: jointAngle(landmarks, 'leftHip', 'leftKnee', 'leftAnkle'),
    rightKnee: jointAngle(landmarks, 'rightHip', 'rightKnee', 'rightAnkle'),
    torsoTilt: torsoTilt(landmarks),
  }
}

function jointAngle(landmarks, firstKey, middleKey, lastKey) {
  const first = landmarks[LANDMARK_INDEX[firstKey]]
  const middle = landmarks[LANDMARK_INDEX[middleKey]]
  const last = landmarks[LANDMARK_INDEX[lastKey]]

  if (!isVisible(first) || !isVisible(middle) || !isVisible(last)) return null

  const vectorA = { x: first.x - middle.x, y: first.y - middle.y }
  const vectorB = { x: last.x - middle.x, y: last.y - middle.y }
  const lengthA = Math.hypot(vectorA.x, vectorA.y)
  const lengthB = Math.hypot(vectorB.x, vectorB.y)

  if (lengthA <= 0 || lengthB <= 0) return null

  const cosine = clamp((vectorA.x * vectorB.x + vectorA.y * vectorB.y) / (lengthA * lengthB), -1, 1)
  return (Math.acos(cosine) * 180) / Math.PI
}

function torsoTilt(landmarks) {
  const leftShoulder = landmarks[LANDMARK_INDEX.leftShoulder]
  const rightShoulder = landmarks[LANDMARK_INDEX.rightShoulder]
  const leftHip = landmarks[LANDMARK_INDEX.leftHip]
  const rightHip = landmarks[LANDMARK_INDEX.rightHip]
  const shoulderCenter = midpoint(leftShoulder, rightShoulder)
  const hipCenter = midpoint(leftHip, rightHip)

  if (!shoulderCenter || !hipCenter) return null

  const dx = shoulderCenter.x - hipCenter.x
  const dy = shoulderCenter.y - hipCenter.y
  return (Math.atan2(dx, -dy) * 180) / Math.PI
}

function ensureLandmarks(landmarks = []) {
  return Array.from({ length: LANDMARK_COUNT }, (_, index) => {
    const landmark = landmarks[index]
    if (!landmark) return { x: 0, y: 0, z: 0, visibility: 0 }
    return {
      x: Number.isFinite(landmark.x) ? landmark.x : 0,
      y: Number.isFinite(landmark.y) ? landmark.y : 0,
      z: Number.isFinite(landmark.z) ? landmark.z : 0,
      visibility: getVisibility(landmark),
    }
  })
}

function midpoint(first, second) {
  if (!isVisible(first) || !isVisible(second)) return null

  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    z: ((first.z ?? 0) + (second.z ?? 0)) / 2,
    visibility: Math.min(first.visibility ?? 1, second.visibility ?? 1),
  }
}

function isVisible(landmark) {
  return Boolean(landmark) && isFinitePoint(landmark) && (landmark.visibility ?? 1) >= VISIBILITY_THRESHOLD
}

function isFinitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y)
}

function getVisibility(landmark, fallback = 1) {
  return Number.isFinite(landmark?.visibility) ? landmark.visibility : fallback
}

function distance(first, second) {
  if (!isFinitePoint(first) || !isFinitePoint(second)) return 0
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function lerp(start, end, ratio) {
  return start + (end - start) * ratio
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export {
  LANDMARK_INDEX,
  VISIBILITY_THRESHOLD,
  LEFT_RIGHT_PAIRS,
  normalizePoseSequence,
  normalizePoseFrame,
  mirrorPoseFrame,
  extractAngleFeatures,
  distance,
  clamp,
}
