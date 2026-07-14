import { alignPoseSequences, poseFrameDistance } from './dtwAlignment.js'
import { LANDMARK_INDEX, clamp, normalizePoseSequence } from './poseNormalizer.js'

const TRACK_GROUPS = {
  right_arm: [LANDMARK_INDEX.rightWrist],
  left_arm: [LANDMARK_INDEX.leftWrist],
  right_leg: [LANDMARK_INDEX.rightAnkle],
  left_leg: [LANDMARK_INDEX.leftAnkle],
  hip: [LANDMARK_INDEX.leftHip, LANDMARK_INDEX.rightHip],
  torso: [
    LANDMARK_INDEX.leftShoulder,
    LANDMARK_INDEX.rightShoulder,
    LANDMARK_INDEX.leftHip,
    LANDMARK_INDEX.rightHip,
  ],
}

const BODY_PART_LABELS = {
  right_arm: '右手臂',
  left_arm: '左手臂',
  right_leg: '右腿',
  left_leg: '左腿',
  hip: '髋部',
  torso: '躯干',
}

function analyzeMovementMetrics(teacherPoseFrames, userPoseFrames) {
  const teacherFrames = normalizePoseSequence(teacherPoseFrames)
  const userNormal = normalizePoseSequence(userPoseFrames)
  const userMirrored = normalizePoseSequence(userPoseFrames, { mirror: true })
  const normalCost = estimateSequenceCost(teacherFrames, userNormal)
  const mirrorCost = estimateSequenceCost(teacherFrames, userMirrored)
  const mirroredUserVideo = mirrorCost + 0.015 < normalCost
  const userFrames = mirroredUserVideo ? userMirrored : userNormal
  const { alignedFramePairs, normalizedCost } = alignPoseSequences(teacherFrames, userFrames)
  const poseSimilarity = computePoseSimilarity(teacherFrames, userFrames, alignedFramePairs)
  const amplitude = computeAmplitudeScore(teacherFrames, userFrames)
  const timing = computeTimingScore(teacherFrames, userFrames)
  const control = computeControlScore(teacherFrames, userFrames)
  const overallScore = Math.round(
    poseSimilarity * 0.36
      + timing.score * 0.24
      + amplitude.score * 0.22
      + control.score * 0.18,
  )

  return {
    overallScore,
    poseSimilarity,
    timingScore: timing.score,
    amplitudeScore: amplitude.score,
    controlScore: control.score,
    mirroredUserVideo,
    alignedFramePairs,
    issues: buildIssues({
      poseSimilarity,
      timing,
      amplitude,
      control,
      alignedFramePairs,
    }),
    diagnostics: {
      teacherFrameCount: teacherFrames.length,
      userFrameCount: userFrames.length,
      alignedPairCount: alignedFramePairs.length,
      dtwCost: Number.isFinite(normalizedCost) ? Number(normalizedCost.toFixed(3)) : null,
      mirrorCost: Number(mirrorCost.toFixed(3)),
      normalCost: Number(normalCost.toFixed(3)),
      amplitudeRatios: amplitude.ratios,
      timingDelays: timing.delays,
      control,
    },
  }
}

function estimateSequenceCost(teacherFrames, userFrames) {
  if (teacherFrames.length === 0 || userFrames.length === 0) return Infinity

  const sampleCount = Math.min(36, teacherFrames.length, userFrames.length)
  let total = 0

  for (let i = 0; i < sampleCount; i++) {
    const ratio = sampleCount <= 1 ? 0 : i / (sampleCount - 1)
    const teacherIndex = Math.round(ratio * (teacherFrames.length - 1))
    const userIndex = Math.round(ratio * (userFrames.length - 1))
    total += poseFrameDistance(teacherFrames[teacherIndex], userFrames[userIndex])
  }

  return total / sampleCount
}

function computePoseSimilarity(teacherFrames, userFrames, alignedFramePairs) {
  if (alignedFramePairs.length === 0) return 0

  const averageDistance = alignedFramePairs.reduce((sum, pair) => {
    return sum + poseFrameDistance(teacherFrames[pair.teacherIndex], userFrames[pair.userIndex])
  }, 0) / alignedFramePairs.length

  return Math.round(clamp(100 - averageDistance * 86, 0, 100))
}

function computeAmplitudeScore(teacherFrames, userFrames) {
  const ratios = {}
  const scores = []

  Object.entries(TRACK_GROUPS).forEach(([bodyPart, indexes]) => {
    const teacherRange = movementRange(teacherFrames, indexes)
    const userRange = movementRange(userFrames, indexes)
    const ratio = teacherRange > 0.04 ? userRange / teacherRange : 1
    const score = ratio <= 1
      ? ratio * 100
      : Math.max(0, 100 - (ratio - 1) * 58)

    ratios[bodyPart] = Number(ratio.toFixed(2))
    scores.push(clamp(score, 0, 100))
  })

  return {
    score: Math.round(average(scores)),
    ratios,
  }
}

function computeTimingScore(teacherFrames, userFrames) {
  const delays = {}
  const scores = []

  Object.entries(TRACK_GROUPS).forEach(([bodyPart, indexes]) => {
    const teacherPeaks = findMotionPeaks(motionEnergy(teacherFrames, indexes))
    const userPeaks = findMotionPeaks(motionEnergy(userFrames, indexes))
    const matched = matchPeaks(teacherPeaks, userPeaks)
    const averageDelay = matched.length > 0
      ? average(matched.map((pair) => pair.user.timestamp - pair.teacher.timestamp))
      : 0
    const averageAbsDelay = matched.length > 0
      ? average(matched.map((pair) => Math.abs(pair.user.timestamp - pair.teacher.timestamp)))
      : 0

    delays[bodyPart] = {
      delayMs: Math.round(averageDelay * 1000),
      absDelayMs: Math.round(averageAbsDelay * 1000),
    }
    scores.push(clamp(100 - averageAbsDelay * 480, 0, 100))
  })

  return {
    score: Math.round(average(scores)),
    delays,
  }
}

function computeControlScore(teacherFrames, userFrames) {
  const teacherSmoothness = trajectoryRoughness(teacherFrames, TRACK_GROUPS.hip)
  const userSmoothness = trajectoryRoughness(userFrames, TRACK_GROUPS.hip)
  const smoothnessRatio = teacherSmoothness > 0.001 ? userSmoothness / teacherSmoothness : userSmoothness
  const endJitter = endingJitter(userFrames, TRACK_GROUPS.hip)
  const torsoTiltStd = standardDeviation(
    userFrames
      .map((frame) => frame.angleFeatures.torsoTilt)
      .filter((value) => Number.isFinite(value)),
  )
  const smoothPenalty = Math.max(0, smoothnessRatio - 1) * 24
  const jitterPenalty = endJitter * 180
  const torsoPenalty = torsoTiltStd * 1.4

  return {
    score: Math.round(clamp(100 - smoothPenalty - jitterPenalty - torsoPenalty, 0, 100)),
    smoothnessRatio: Number(smoothnessRatio.toFixed(2)),
    endJitter: Number(endJitter.toFixed(3)),
    torsoTiltStd: Number(torsoTiltStd.toFixed(1)),
  }
}

function buildIssues({ poseSimilarity, timing, amplitude, control, alignedFramePairs }) {
  const issues = []
  const biggestDelay = maxEntry(timing.delays, (entry) => entry.absDelayMs)
  const weakestAmplitude = minEntry(amplitude.ratios, (ratio) => ratio)
  const representativePair = alignedFramePairs[Math.floor(alignedFramePairs.length / 2)]

  if (biggestDelay && biggestDelay.value.absDelayMs >= 120) {
    issues.push({
      type: biggestDelay.value.delayMs >= 0 ? 'timing_delay' : 'timing_early',
      bodyPart: biggestDelay.key,
      bodyPartLabel: BODY_PART_LABELS[biggestDelay.key],
      delayMs: biggestDelay.value.delayMs,
      severity: severityFromDelay(biggestDelay.value.absDelayMs),
      teacherTimestamp: representativePair?.teacherTimestamp ?? 0,
    })
  }

  if (weakestAmplitude && weakestAmplitude.value < 0.86) {
    issues.push({
      type: 'insufficient_amplitude',
      bodyPart: weakestAmplitude.key,
      bodyPartLabel: BODY_PART_LABELS[weakestAmplitude.key],
      ratio: Number(weakestAmplitude.value.toFixed(2)),
      severity: weakestAmplitude.value < 0.68 ? 'high' : 'medium',
      teacherTimestamp: representativePair?.teacherTimestamp ?? 0,
    })
  }

  if (control.endJitter >= 0.055) {
    issues.push({
      type: 'end_position_jitter',
      bodyPart: 'hip',
      bodyPartLabel: BODY_PART_LABELS.hip,
      severity: control.endJitter >= 0.1 ? 'high' : 'medium',
      teacherTimestamp: alignedFramePairs.at(-1)?.teacherTimestamp ?? 0,
    })
  }

  if (control.torsoTiltStd >= 10) {
    issues.push({
      type: 'torso_instability',
      bodyPart: 'torso',
      bodyPartLabel: BODY_PART_LABELS.torso,
      severity: control.torsoTiltStd >= 16 ? 'high' : 'medium',
      teacherTimestamp: representativePair?.teacherTimestamp ?? 0,
    })
  }

  if (poseSimilarity < 72) {
    issues.push({
      type: 'pose_similarity_gap',
      bodyPart: 'torso',
      bodyPartLabel: BODY_PART_LABELS.torso,
      severity: poseSimilarity < 56 ? 'high' : 'medium',
      teacherTimestamp: representativePair?.teacherTimestamp ?? 0,
    })
  }

  return issues.slice(0, 5)
}

function movementRange(frames, landmarkIndexes) {
  const ranges = landmarkIndexes
    .map((landmarkIndex) => {
      const points = frames
        .map((frame) => frame.normalizedLandmarks[landmarkIndex])
        .filter((landmark) => landmark && landmark.visibility >= 0.5)

      if (points.length < 2) return 0

      const xs = points.map((point) => point.x)
      const ys = points.map((point) => point.y)
      return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    })
    .filter((value) => value > 0)

  return ranges.length > 0 ? average(ranges) : 0
}

function motionEnergy(frames, landmarkIndexes) {
  const energy = []

  for (let index = 1; index < frames.length; index++) {
    const previous = frames[index - 1]
    const current = frames[index]
    const values = landmarkIndexes.map((landmarkIndex) => {
      const a = previous.normalizedLandmarks[landmarkIndex]
      const b = current.normalizedLandmarks[landmarkIndex]
      if (!a || !b || a.visibility < 0.5 || b.visibility < 0.5) return 0
      return Math.hypot(b.x - a.x, b.y - a.y)
    })

    energy.push({
      timestamp: current.timestamp,
      value: average(values),
    })
  }

  return energy
}

function findMotionPeaks(energy) {
  const sorted = energy
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
  const selected = []
  const minGap = Math.max(4, Math.floor(energy.length / 10))

  for (const candidate of sorted) {
    if (selected.some((item) => Math.abs(item.index - candidate.index) < minGap)) continue
    selected.push(candidate)
    if (selected.length >= 3) break
  }

  return selected.sort((a, b) => a.timestamp - b.timestamp)
}

function matchPeaks(teacherPeaks, userPeaks) {
  const count = Math.min(teacherPeaks.length, userPeaks.length)
  return Array.from({ length: count }, (_, index) => ({
    teacher: teacherPeaks[index],
    user: userPeaks[index],
  }))
}

function trajectoryRoughness(frames, landmarkIndexes) {
  const centers = frames.map((frame) => centerOfLandmarks(frame, landmarkIndexes)).filter(Boolean)
  if (centers.length < 3) return 0

  const accelerations = []
  for (let index = 2; index < centers.length; index++) {
    const a = centers[index - 2]
    const b = centers[index - 1]
    const c = centers[index]
    const vx1 = b.x - a.x
    const vy1 = b.y - a.y
    const vx2 = c.x - b.x
    const vy2 = c.y - b.y
    accelerations.push(Math.hypot(vx2 - vx1, vy2 - vy1))
  }

  return average(accelerations)
}

function endingJitter(frames, landmarkIndexes) {
  const tailStart = Math.floor(frames.length * 0.85)
  const centers = frames.slice(tailStart).map((frame) => centerOfLandmarks(frame, landmarkIndexes)).filter(Boolean)
  if (centers.length < 3) return 0

  const center = {
    x: average(centers.map((point) => point.x)),
    y: average(centers.map((point) => point.y)),
  }

  return average(centers.map((point) => Math.hypot(point.x - center.x, point.y - center.y)))
}

function centerOfLandmarks(frame, landmarkIndexes) {
  const points = landmarkIndexes
    .map((index) => frame.normalizedLandmarks[index])
    .filter((point) => point && point.visibility >= 0.5)

  if (points.length === 0) return null

  return {
    x: average(points.map((point) => point.x)),
    y: average(points.map((point) => point.y)),
  }
}

function maxEntry(object, selector) {
  return Object.entries(object).reduce((best, [key, value]) => {
    const selected = selector(value)
    if (!best || selected > best.selected) return { key, value, selected }
    return best
  }, null)
}

function minEntry(object, selector) {
  return Object.entries(object).reduce((best, [key, value]) => {
    const selected = selector(value)
    if (!best || selected < best.selected) return { key, value, selected }
    return best
  }, null)
}

function severityFromDelay(delayMs) {
  if (delayMs >= 260) return 'high'
  if (delayMs >= 140) return 'medium'
  return 'low'
}

function standardDeviation(values) {
  if (values.length === 0) return 0
  const mean = average(values)
  const variance = average(values.map((value) => (value - mean) ** 2))
  return Math.sqrt(variance)
}

function average(values) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export {
  TRACK_GROUPS,
  BODY_PART_LABELS,
  analyzeMovementMetrics,
  estimateSequenceCost,
  computePoseSimilarity,
  computeAmplitudeScore,
  computeTimingScore,
  computeControlScore,
}
