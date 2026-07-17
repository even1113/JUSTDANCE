const CORE_LANDMARKS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
const CENTER_LANDMARKS = [11, 12, 23, 24]
const MIN_VISIBILITY = 0.35
const MAX_CENTER_DISTANCE = 0.28
const MAX_SIGNATURE_DISTANCE = 0.42

function createSubjectTracker(options = {}) {
  const cropRect = normalizeCropRect(
    options.cropRect,
    options.videoWidth,
    options.videoHeight,
  )
  const trackId = options.trackId || `subject-${Math.random().toString(36).slice(2, 9)}`
  let previous = null
  let velocity = { x: 0, y: 0 }
  let lostFrames = 0
  let everLocked = false

  function select(result) {
    const candidates = buildPoseCandidates(result)

    if (!previous) {
      const initial = chooseInitialCandidate(candidates, cropRect)
      if (!initial) {
        lostFrames++
        return lostResult(trackId, lostFrames, everLocked)
      }

      previous = initial
      lostFrames = 0
      everLocked = true
      return trackedResult(initial, trackId, lostFrames)
    }

    const predictedCenter = {
      x: previous.center.x + velocity.x,
      y: previous.center.y + velocity.y,
    }
    const matched = chooseTrackedCandidate(
      candidates,
      previous,
      predictedCenter,
      cropRect,
      lostFrames,
    )

    if (!matched) {
      lostFrames++
      return lostResult(trackId, lostFrames, everLocked)
    }

    velocity = {
      x: clamp(matched.center.x - previous.center.x, -0.08, 0.08),
      y: clamp(matched.center.y - previous.center.y, -0.08, 0.08),
    }
    previous = matched
    lostFrames = 0
    return trackedResult(matched, trackId, lostFrames)
  }

  function reset() {
    previous = null
    velocity = { x: 0, y: 0 }
    lostFrames = 0
    everLocked = false
  }

  return {
    trackId,
    select,
    reset,
    getState: () => ({
      trackId,
      lostFrames,
      everLocked,
      center: previous?.center || null,
      box: previous?.box || null,
    }),
  }
}

function buildPoseCandidates(result) {
  const landmarksList = result?.landmarks || []
  const worldList = result?.worldLandmarks || []

  return landmarksList
    .map((landmarks, index) => buildPoseCandidate(landmarks, worldList[index], index))
    .filter(Boolean)
}

function buildPoseCandidate(landmarks, worldLandmarks = [], index = 0) {
  if (!landmarks || landmarks.length < 33) return null

  const visible = landmarks
    .map((landmark, landmarkIndex) => ({ ...landmark, landmarkIndex }))
    .filter((landmark) => {
      return Number.isFinite(landmark.x)
        && Number.isFinite(landmark.y)
        && (landmark.visibility ?? 1) >= MIN_VISIBILITY
    })
  if (visible.length < 8) return null

  const centerPoints = CENTER_LANDMARKS
    .map((landmarkIndex) => landmarks[landmarkIndex])
    .filter(isVisibleLandmark)
  const center = centerPoints.length > 0
    ? averagePoint(centerPoints)
    : averagePoint(visible)
  const xs = visible.map((landmark) => landmark.x)
  const ys = visible.map((landmark) => landmark.y)
  const box = {
    x: clamp(Math.min(...xs), 0, 1),
    y: clamp(Math.min(...ys), 0, 1),
    width: clamp(Math.max(...xs) - Math.min(...xs), 0.01, 1),
    height: clamp(Math.max(...ys) - Math.min(...ys), 0.01, 1),
  }
  const scale = Math.max(0.08, Math.hypot(box.width, box.height))
  const signature = CORE_LANDMARKS.map((landmarkIndex) => {
    const landmark = landmarks[landmarkIndex]
    if (!isVisibleLandmark(landmark)) return null
    return {
      x: (landmark.x - center.x) / scale,
      y: (landmark.y - center.y) / scale,
    }
  })
  const visibility = average(
    CORE_LANDMARKS.map((landmarkIndex) => landmarks[landmarkIndex]?.visibility ?? 0),
  )

  return {
    index,
    landmarks,
    worldLandmarks,
    center,
    box,
    signature,
    visibility,
    area: box.width * box.height,
  }
}

function chooseInitialCandidate(candidates, cropRect) {
  if (candidates.length === 0) return null

  const ranked = candidates
    .map((candidate) => {
      const cropOverlap = cropRect ? intersectionOverCandidate(candidate.box, cropRect) : 0
      const centerInside = cropRect ? pointInside(candidate.center, cropRect) : false
      const centerDistance = cropRect
        ? pointDistance(candidate.center, rectCenter(cropRect))
        : pointDistance(candidate.center, { x: 0.5, y: 0.5 })
      const score = cropRect
        ? cropOverlap * 0.58 + Number(centerInside) * 0.3 + candidate.visibility * 0.1 - centerDistance * 0.12
        : candidate.visibility * 0.52 + Math.min(candidate.area, 0.36) * 0.8 - centerDistance * 0.16
      return { candidate, score, cropOverlap, centerInside }
    })
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  if (cropRect && !best.centerInside && best.cropOverlap < 0.18) return null
  return best.candidate
}

function chooseTrackedCandidate(candidates, previous, predictedCenter, cropRect, lostFrames) {
  if (candidates.length === 0) return null

  const searchRadius = Math.min(
    0.46,
    Math.max(MAX_CENTER_DISTANCE, Math.hypot(previous.box.width, previous.box.height) * 0.8)
      + lostFrames * 0.018,
  )
  const ranked = candidates
    .map((candidate) => {
      const centerDistance = pointDistance(candidate.center, predictedCenter)
      const signatureDistance = poseSignatureDistance(previous.signature, candidate.signature)
      const boxOverlap = intersectionOverUnion(previous.box, candidate.box)
      const cropOverlap = cropRect ? intersectionOverCandidate(candidate.box, cropRect) : 0
      const score = (1 - centerDistance) * 0.32
        + (1 - signatureDistance) * 0.45
        + boxOverlap * 0.13
        + candidate.visibility * 0.08
        + cropOverlap * 0.02
      return {
        candidate,
        score,
        centerDistance,
        signatureDistance,
        boxOverlap,
      }
    })
    .filter((match) => {
      if (match.centerDistance > searchRadius) return false
      if (match.signatureDistance > MAX_SIGNATURE_DISTANCE + lostFrames * 0.012) return false
      if (lostFrames > 0 && match.boxOverlap < 0.01 && match.centerDistance > searchRadius * 0.72) {
        return false
      }
      return true
    })
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  if (!best || best.score < 0.48) return null
  return best.candidate
}

function trackedResult(candidate, trackId, lostFrames) {
  return {
    status: 'tracked',
    trackId,
    candidateIndex: candidate.index,
    candidate,
    lostFrames,
  }
}

function lostResult(trackId, lostFrames, everLocked) {
  return {
    status: 'lost',
    trackId,
    candidateIndex: -1,
    candidate: null,
    lostFrames,
    everLocked,
  }
}

function normalizeCropRect(cropRect, videoWidth, videoHeight) {
  if (!cropRect) return null

  const width = Number(cropRect.sourceWidth) || Number(videoWidth) || 1
  const height = Number(cropRect.sourceHeight) || Number(videoHeight) || 1
  return {
    x: clamp((Number(cropRect.x) || 0) / width, 0, 1),
    y: clamp((Number(cropRect.y) || 0) / height, 0, 1),
    width: clamp((Number(cropRect.width) || 0) / width, 0.001, 1),
    height: clamp((Number(cropRect.height) || 0) / height, 0.001, 1),
  }
}

function poseSignatureDistance(first, second) {
  let total = 0
  let count = 0

  for (let index = 0; index < Math.min(first.length, second.length); index++) {
    if (!first[index] || !second[index]) continue
    total += pointDistance(first[index], second[index])
    count++
  }

  return count > 0 ? total / count : 1
}

function intersectionOverUnion(first, second) {
  const intersection = intersectionArea(first, second)
  const union = first.width * first.height + second.width * second.height - intersection
  return union > 0 ? intersection / union : 0
}

function intersectionOverCandidate(candidate, region) {
  const area = candidate.width * candidate.height
  return area > 0 ? intersectionArea(candidate, region) / area : 0
}

function intersectionArea(first, second) {
  const left = Math.max(first.x, second.x)
  const top = Math.max(first.y, second.y)
  const right = Math.min(first.x + first.width, second.x + second.width)
  const bottom = Math.min(first.y + first.height, second.y + second.height)
  return Math.max(0, right - left) * Math.max(0, bottom - top)
}

function pointInside(point, rect) {
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height
}

function rectCenter(rect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
}

function pointDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function averagePoint(points) {
  return {
    x: average(points.map((point) => point.x)),
    y: average(points.map((point) => point.y)),
  }
}

function isVisibleLandmark(landmark) {
  return landmark
    && Number.isFinite(landmark.x)
    && Number.isFinite(landmark.y)
    && (landmark.visibility ?? 1) >= MIN_VISIBILITY
}

function average(values) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export {
  buildPoseCandidate,
  buildPoseCandidates,
  createSubjectTracker,
  normalizeCropRect,
  poseSignatureDistance,
}
