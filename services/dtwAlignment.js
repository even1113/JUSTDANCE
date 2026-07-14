const ANGLE_KEYS = [
  'leftElbow',
  'rightElbow',
  'leftShoulder',
  'rightShoulder',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'torsoTilt',
]

const LANDMARK_FEATURE_INDICES = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]

function alignPoseSequences(teacherFrames, userFrames, options = {}) {
  if (teacherFrames.length === 0 || userFrames.length === 0) {
    return {
      alignedFramePairs: [],
      normalizedCost: 0,
    }
  }

  const bandRatio = options.bandRatio ?? 0.18
  const band = Math.max(8, Math.ceil(Math.max(teacherFrames.length, userFrames.length) * bandRatio))
  const rows = teacherFrames.length
  const cols = userFrames.length
  const cost = Array.from({ length: rows }, () => Array(cols).fill(Infinity))
  const parent = Array.from({ length: rows }, () => Array(cols).fill(null))

  for (let row = 0; row < rows; row++) {
    const expectedCol = Math.round((row / Math.max(1, rows - 1)) * Math.max(0, cols - 1))
    const colStart = Math.max(0, expectedCol - band)
    const colEnd = Math.min(cols - 1, expectedCol + band)

    for (let col = colStart; col <= colEnd; col++) {
      const localCost = poseFrameDistance(teacherFrames[row], userFrames[col])

      if (row === 0 && col === 0) {
        cost[row][col] = localCost
        continue
      }

      const candidates = [
        { row: row - 1, col },
        { row, col: col - 1 },
        { row: row - 1, col: col - 1 },
      ].filter((candidate) => candidate.row >= 0 && candidate.col >= 0)

      let best = null
      for (const candidate of candidates) {
        const value = cost[candidate.row]?.[candidate.col]
        if (!Number.isFinite(value)) continue
        if (!best || value < best.value) best = { ...candidate, value }
      }

      if (!best) continue

      cost[row][col] = localCost + best.value
      parent[row][col] = { row: best.row, col: best.col }
    }
  }

  const rawPath = backtrackPath(parent, cost)
  const alignedFramePairs = compressTeacherPairs(rawPath, teacherFrames, userFrames)

  return {
    alignedFramePairs,
    normalizedCost: cost[rows - 1][cols - 1] / Math.max(1, rawPath.length),
  }
}

function backtrackPath(parent, cost) {
  let row = cost.length - 1
  let col = cost[0].length - 1
  const path = []

  if (!Number.isFinite(cost[row][col])) {
    row = cost.length - 1
    col = bestReachableColumn(cost[row])
  }

  while (row >= 0 && col >= 0) {
    path.push({ teacherIndex: row, userIndex: col })
    const next = parent[row][col]
    if (!next) break
    row = next.row
    col = next.col
  }

  return path.reverse()
}

function bestReachableColumn(row) {
  let bestIndex = 0
  let bestValue = Infinity

  row.forEach((value, index) => {
    if (value < bestValue) {
      bestValue = value
      bestIndex = index
    }
  })

  return bestIndex
}

function compressTeacherPairs(path, teacherFrames, userFrames) {
  const byTeacher = new Map()

  path.forEach((pair) => {
    const list = byTeacher.get(pair.teacherIndex) || []
    list.push(pair.userIndex)
    byTeacher.set(pair.teacherIndex, list)
  })

  return teacherFrames.map((teacherFrame, teacherIndex) => {
    const userIndexes = byTeacher.get(teacherIndex) || [nearestUserIndex(teacherIndex, teacherFrames.length, userFrames.length)]
    const userIndex = Math.round(userIndexes.reduce((sum, item) => sum + item, 0) / userIndexes.length)
    const userFrame = userFrames[userIndex]

    return {
      teacherIndex,
      userIndex,
      teacherTimestamp: teacherFrame.timestamp,
      userTimestamp: userFrame?.timestamp ?? teacherFrame.timestamp,
      distance: userFrame ? poseFrameDistance(teacherFrame, userFrame) : 1,
    }
  })
}

function nearestUserIndex(teacherIndex, teacherLength, userLength) {
  const ratio = teacherLength <= 1 ? 0 : teacherIndex / (teacherLength - 1)
  return Math.round(ratio * Math.max(0, userLength - 1))
}

function poseFrameDistance(teacherFrame, userFrame) {
  const landmarkDistance = normalizedLandmarkDistance(teacherFrame, userFrame)
  const angleDistance = normalizedAngleDistance(teacherFrame.angleFeatures, userFrame.angleFeatures)

  return landmarkDistance * 0.62 + angleDistance * 0.38
}

function normalizedLandmarkDistance(teacherFrame, userFrame) {
  let total = 0
  let count = 0

  LANDMARK_FEATURE_INDICES.forEach((index) => {
    const teacher = teacherFrame.normalizedLandmarks[index]
    const user = userFrame.normalizedLandmarks[index]

    if (!isUsable(teacher) || !isUsable(user)) return

    total += Math.hypot(teacher.x - user.x, teacher.y - user.y)
    count++
  })

  return count > 0 ? total / count : 1
}

function normalizedAngleDistance(teacherAngles, userAngles) {
  let total = 0
  let count = 0

  ANGLE_KEYS.forEach((key) => {
    const teacher = teacherAngles?.[key]
    const user = userAngles?.[key]

    if (!Number.isFinite(teacher) || !Number.isFinite(user)) return

    total += Math.abs(teacher - user) / 180
    count++
  })

  return count > 0 ? total / count : 1
}

function isUsable(landmark) {
  return landmark && landmark.visibility >= 0.5 && Number.isFinite(landmark.x) && Number.isFinite(landmark.y)
}

export {
  ANGLE_KEYS,
  LANDMARK_FEATURE_INDICES,
  alignPoseSequences,
  poseFrameDistance,
  normalizedLandmarkDistance,
  normalizedAngleDistance,
}
