const ENVELOPE_RATE = 20
const DEFAULT_MAX_OFFSET_SEC = 30
const MIN_OVERLAP_SEC = 8
const MIN_CORRELATION = 0.2
const LOCAL_WINDOW_SEC = 8
const LOCAL_SEARCH_RADIUS_SEC = 0.8
const MAX_DRIFT_RATE = 0.015

async function alignAudioTracks(teacherFile, userFile, options = {}) {
  if (!teacherFile || !userFile) {
    throw new Error('请先添加老师视频和我的视频')
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) {
    throw new Error('当前浏览器不支持音轨分析，请使用手动偏移标定')
  }

  const audioContext = new AudioContextClass()

  try {
    const [teacherBuffer, userBuffer] = await Promise.all([
      decodeMediaAudio(audioContext, teacherFile),
      decodeMediaAudio(audioContext, userFile),
    ])
    const envelopeRate = options.envelopeRate || ENVELOPE_RATE
    const teacherEnvelope = buildOnsetEnvelope(teacherBuffer, envelopeRate)
    const userEnvelope = buildOnsetEnvelope(userBuffer, envelopeRate)
    const result = findBestAudioOffset(teacherEnvelope, userEnvelope, {
      envelopeRate,
      maxOffsetSec: options.maxOffsetSec || DEFAULT_MAX_OFFSET_SEC,
      minOverlapSec: options.minOverlapSec || MIN_OVERLAP_SEC,
    })

    if (result.correlation < MIN_CORRELATION) {
      throw new Error('两段音轨的相似度不足，无法可靠自动对齐，请使用手动偏移标定')
    }

    const timeline = estimateAudioTimeline(teacherEnvelope, userEnvelope, {
      envelopeRate,
      teacherDuration: teacherBuffer.duration,
      userDuration: userBuffer.duration,
      baseOffsetSec: result.offsetSec,
      baseCorrelation: result.correlation,
    })

    return {
      offsetSec: timeline.offsetSec,
      confidence: result.confidence,
      correlation: result.correlation,
      method: 'audio_correlation',
      timeline,
    }
  } catch (error) {
    if (error?.message?.includes('手动偏移')) throw error
    throw new Error('浏览器无法解析其中一段视频的音轨，请使用手动偏移标定')
  } finally {
    await audioContext.close().catch(() => {})
  }
}

async function decodeMediaAudio(audioContext, file) {
  const source = await file.arrayBuffer()
  return audioContext.decodeAudioData(source.slice(0))
}

function buildOnsetEnvelope(audioBuffer, envelopeRate = ENVELOPE_RATE) {
  const channelCount = audioBuffer.numberOfChannels
  const samplesPerWindow = Math.max(1, Math.floor(audioBuffer.sampleRate / envelopeRate))
  const windowCount = Math.max(1, Math.floor(audioBuffer.length / samplesPerWindow))
  const energy = new Float32Array(windowCount)

  for (let windowIndex = 0; windowIndex < windowCount; windowIndex++) {
    const start = windowIndex * samplesPerWindow
    const end = Math.min(audioBuffer.length, start + samplesPerWindow)
    let sum = 0

    for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
      const channel = audioBuffer.getChannelData(channelIndex)
      for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
        const sample = channel[sampleIndex]
        sum += sample * sample
      }
    }

    energy[windowIndex] = Math.sqrt(sum / Math.max(1, (end - start) * channelCount))
  }

  const onset = new Float32Array(windowCount)
  for (let index = 1; index < windowCount; index++) {
    onset[index] = Math.max(0, energy[index] - energy[index - 1])
  }

  return normalizeSignal(onset)
}

function normalizeSignal(values) {
  if (values.length === 0) return values

  let sum = 0
  for (const value of values) sum += value
  const mean = sum / values.length
  let variance = 0
  for (const value of values) variance += (value - mean) ** 2
  const deviation = Math.sqrt(variance / values.length) || 1
  const normalized = new Float32Array(values.length)

  for (let index = 0; index < values.length; index++) {
    normalized[index] = (values[index] - mean) / deviation
  }

  return normalized
}

function findBestAudioOffset(teacherEnvelope, userEnvelope, options = {}) {
  const envelopeRate = options.envelopeRate || ENVELOPE_RATE
  const maxOffsetSamples = Math.round((options.maxOffsetSec || DEFAULT_MAX_OFFSET_SEC) * envelopeRate)
  const minOverlapSamples = Math.max(8, Math.round((options.minOverlapSec || MIN_OVERLAP_SEC) * envelopeRate))
  let best = { lag: 0, correlation: -Infinity }
  const candidates = []

  for (let lag = -maxOffsetSamples; lag <= maxOffsetSamples; lag++) {
    const teacherStart = Math.max(0, -lag)
    const userStart = Math.max(0, lag)
    const overlap = Math.min(
      teacherEnvelope.length - teacherStart,
      userEnvelope.length - userStart,
    )

    if (overlap < minOverlapSamples) continue

    let product = 0
    let teacherEnergy = 0
    let userEnergy = 0
    for (let index = 0; index < overlap; index++) {
      const teacherValue = teacherEnvelope[teacherStart + index]
      const userValue = userEnvelope[userStart + index]
      product += teacherValue * userValue
      teacherEnergy += teacherValue * teacherValue
      userEnergy += userValue * userValue
    }

    const denominator = Math.sqrt(teacherEnergy * userEnergy)
    const correlation = denominator > 0 ? product / denominator : -1
    candidates.push({ lag, correlation })
    if (correlation > best.correlation) best = { lag, correlation }
  }

  const exclusion = Math.max(1, Math.round(envelopeRate * 0.75))
  const secondBest = candidates
    .filter((candidate) => Math.abs(candidate.lag - best.lag) > exclusion)
    .reduce((current, candidate) => candidate.correlation > current ? candidate.correlation : current, -1)
  const margin = Math.max(0, best.correlation - secondBest)

  return {
    offsetSec: Number((best.lag / envelopeRate).toFixed(2)),
    correlation: Number(best.correlation.toFixed(3)),
    confidence: Math.round(clamp((best.correlation * 0.75 + margin * 0.25) * 100, 0, 100)),
  }
}

function estimateAudioTimeline(teacherEnvelope, userEnvelope, options = {}) {
  const envelopeRate = options.envelopeRate || ENVELOPE_RATE
  const teacherDuration = Number(options.teacherDuration) || teacherEnvelope.length / envelopeRate
  const userDuration = Number(options.userDuration) || userEnvelope.length / envelopeRate
  const baseOffsetSec = Number(options.baseOffsetSec) || 0
  const baseLag = Math.round(baseOffsetSec * envelopeRate)
  const overlapStart = Math.max(0, -baseOffsetSec)
  const overlapEnd = Math.min(teacherDuration, userDuration - baseOffsetSec)
  const overlapDuration = Math.max(0, overlapEnd - overlapStart)
  const windowSec = Math.min(LOCAL_WINDOW_SEC, Math.max(3, overlapDuration / 3))
  const halfWindowSamples = Math.max(12, Math.round((windowSec * envelopeRate) / 2))
  const searchRadiusSamples = Math.max(2, Math.round(LOCAL_SEARCH_RADIUS_SEC * envelopeRate))
  const anchorCount = clamp(Math.round(overlapDuration / 8) + 1, 2, 8)
  const measuredAnchors = []

  for (let index = 0; index < anchorCount; index++) {
    const ratio = anchorCount <= 1 ? 0.5 : index / (anchorCount - 1)
    const teacherTime = overlapStart + windowSec / 2
      + ratio * Math.max(0, overlapDuration - windowSec)
    const teacherCenter = Math.round(teacherTime * envelopeRate)
    const local = findLocalLag(
      teacherEnvelope,
      userEnvelope,
      teacherCenter,
      halfWindowSamples,
      baseLag,
      searchRadiusSamples,
    )

    if (!local || local.correlation < Math.max(0.16, (options.baseCorrelation || 0) * 0.45)) {
      continue
    }

    measuredAnchors.push({
      teacherTime: Number(teacherTime.toFixed(3)),
      userTime: Number((teacherTime + local.lag / envelopeRate).toFixed(3)),
      offsetSec: Number((local.lag / envelopeRate).toFixed(3)),
      correlation: Number(local.correlation.toFixed(3)),
    })
  }

  const regression = fitTimelineRegression(measuredAnchors, baseOffsetSec)
  const driftRate = Math.abs(regression.slope - 1) <= MAX_DRIFT_RATE
    ? regression.slope
    : 1
  const offsetSec = driftRate === 1 && Math.abs(regression.slope - 1) > MAX_DRIFT_RATE
    ? baseOffsetSec
    : regression.intercept
  const mapAnchors = [
    {
      teacherTime: 0,
      userTime: offsetSec,
    },
    {
      teacherTime: teacherDuration,
      userTime: offsetSec + teacherDuration * driftRate,
    },
  ]

  return createAudioTimeline({
    offsetSec,
    teacherDuration,
    userDuration,
    mapAnchors,
    measuredAnchors,
    driftRate,
  })
}

function findLocalLag(
  teacherEnvelope,
  userEnvelope,
  teacherCenter,
  halfWindowSamples,
  expectedLag,
  searchRadiusSamples,
) {
  let best = null

  for (
    let lag = expectedLag - searchRadiusSamples;
    lag <= expectedLag + searchRadiusSamples;
    lag++
  ) {
    const teacherStart = Math.max(0, teacherCenter - halfWindowSamples, -lag)
    const teacherEnd = Math.min(
      teacherEnvelope.length,
      teacherCenter + halfWindowSamples,
      userEnvelope.length - lag,
    )
    const overlap = teacherEnd - teacherStart
    if (overlap < halfWindowSamples) continue

    let product = 0
    let teacherEnergy = 0
    let userEnergy = 0

    for (let teacherIndex = teacherStart; teacherIndex < teacherEnd; teacherIndex++) {
      const userIndex = teacherIndex + lag
      const teacherValue = teacherEnvelope[teacherIndex]
      const userValue = userEnvelope[userIndex]
      product += teacherValue * userValue
      teacherEnergy += teacherValue * teacherValue
      userEnergy += userValue * userValue
    }

    const denominator = Math.sqrt(teacherEnergy * userEnergy)
    const correlation = denominator > 0 ? product / denominator : -1
    if (!best || correlation > best.correlation) best = { lag, correlation }
  }

  return best
}

function fitTimelineRegression(anchors, fallbackOffsetSec = 0) {
  if (anchors.length < 2) {
    return {
      slope: 1,
      intercept: anchors[0]?.offsetSec ?? fallbackOffsetSec,
    }
  }

  const teacherMean = average(anchors.map((anchor) => anchor.teacherTime))
  const userMean = average(anchors.map((anchor) => anchor.userTime))
  let covariance = 0
  let variance = 0

  anchors.forEach((anchor) => {
    covariance += (anchor.teacherTime - teacherMean) * (anchor.userTime - userMean)
    variance += (anchor.teacherTime - teacherMean) ** 2
  })

  const slope = variance > 0 ? covariance / variance : 1
  return {
    slope,
    intercept: userMean - slope * teacherMean,
  }
}

function createAudioTimeline({
  offsetSec = 0,
  teacherDuration = 0,
  userDuration = 0,
  mapAnchors = null,
  measuredAnchors = [],
  driftRate = 1,
} = {}) {
  const safeTeacherDuration = Math.max(0, Number(teacherDuration) || 0)
  const safeUserDuration = Math.max(0, Number(userDuration) || 0)
  const safeOffset = Number(offsetSec) || 0
  const safeRate = clamp(Number(driftRate) || 1, 1 - MAX_DRIFT_RATE, 1 + MAX_DRIFT_RATE)
  const anchors = normalizeMapAnchors(mapAnchors || [
    { teacherTime: 0, userTime: safeOffset },
    {
      teacherTime: safeTeacherDuration,
      userTime: safeOffset + safeTeacherDuration * safeRate,
    },
  ])
  const firstSlope = slopeBetween(anchors[0], anchors[1]) || safeRate
  const lastSlope = slopeBetween(anchors.at(-2), anchors.at(-1)) || safeRate
  const teacherStart = clamp(
    teacherTimeForUserTime(anchors, 0, firstSlope),
    0,
    safeTeacherDuration,
  )
  const teacherEnd = clamp(
    teacherTimeForUserTime(anchors, safeUserDuration, lastSlope),
    0,
    safeTeacherDuration,
  )
  const start = Math.min(teacherStart, teacherEnd)
  const end = Math.max(teacherStart, teacherEnd)

  return {
    offsetSec: safeOffset,
    driftRate: Number(safeRate.toFixed(6)),
    driftSec: Number(((safeRate - 1) * Math.max(0, end - start)).toFixed(3)),
    teacherStart: Number(start.toFixed(3)),
    teacherEnd: Number(end.toFixed(3)),
    duration: Number(Math.max(0, end - start).toFixed(3)),
    mapAnchors: anchors,
    measuredAnchors,
  }
}

function createManualAudioAlignment(offsetSec, teacherDuration, userDuration) {
  const timeline = createAudioTimeline({
    offsetSec,
    teacherDuration,
    userDuration,
  })

  return {
    offsetSec: timeline.offsetSec,
    confidence: null,
    correlation: null,
    method: 'manual',
    timeline,
  }
}

function shiftAudioAlignment(alignment, nextOffsetSec, teacherDuration, userDuration) {
  const currentOffset = Number(alignment?.offsetSec) || 0
  const safeOffset = Number(nextOffsetSec) || 0
  const delta = safeOffset - currentOffset
  const existingAnchors = alignment?.timeline?.mapAnchors
  const mapAnchors = existingAnchors?.map((anchor) => ({
    teacherTime: anchor.teacherTime,
    userTime: anchor.userTime + delta,
  }))
  const driftRate = alignment?.timeline?.driftRate || 1
  const timeline = createAudioTimeline({
    offsetSec: safeOffset,
    teacherDuration,
    userDuration,
    mapAnchors,
    measuredAnchors: alignment?.timeline?.measuredAnchors || [],
    driftRate,
  })

  return {
    ...alignment,
    offsetSec: safeOffset,
    method: alignment?.method === 'audio_correlation' ? 'audio_correlation_adjusted' : 'manual',
    timeline,
  }
}

function teacherTimeToUserTime(alignment, teacherTime) {
  const anchors = alignment?.timeline?.mapAnchors
  if (!anchors?.length) {
    return teacherTime + (Number(alignment?.offsetSec) || 0)
  }

  return interpolateAnchors(anchors, teacherTime, 'teacherTime', 'userTime')
}

function userTimeToTeacherTime(alignment, userTime) {
  const anchors = alignment?.timeline?.mapAnchors
  if (!anchors?.length) {
    return userTime - (Number(alignment?.offsetSec) || 0)
  }

  return interpolateAnchors(anchors, userTime, 'userTime', 'teacherTime')
}

function commonTimeToSourceTimes(alignment, commonTime) {
  const teacherStart = Number(alignment?.timeline?.teacherStart) || 0
  const duration = Number(alignment?.timeline?.duration)
  const safeCommonTime = Number.isFinite(duration)
    ? clamp(Number(commonTime) || 0, 0, duration)
    : Math.max(0, Number(commonTime) || 0)
  const teacherTime = teacherStart + safeCommonTime

  return {
    commonTime: safeCommonTime,
    teacherTime,
    userTime: teacherTimeToUserTime(alignment, teacherTime),
  }
}

function sourceTimesToCommonTime(alignment, teacherTime) {
  const teacherStart = Number(alignment?.timeline?.teacherStart) || 0
  const duration = Number(alignment?.timeline?.duration)
  return Number.isFinite(duration)
    ? clamp(teacherTime - teacherStart, 0, duration)
    : Math.max(0, teacherTime - teacherStart)
}

function localUserPlaybackRate(alignment, teacherTime) {
  const anchors = alignment?.timeline?.mapAnchors
  if (!anchors || anchors.length < 2) return 1
  const index = findAnchorSegment(anchors, teacherTime, 'teacherTime')
  return clamp(slopeBetween(anchors[index], anchors[index + 1]) || 1, 0.985, 1.015)
}

function alignPoseFramesToAudio(teacherFrames, userFrames, alignment = {}) {
  const teacherDuration = teacherFrames.at(-1)?.timestamp || 0
  const userDuration = userFrames.at(-1)?.timestamp || 0
  const resolvedAlignment = alignment?.timeline
    ? alignment
    : createManualAudioAlignment(alignment?.offsetSec || 0, teacherDuration, userDuration)
  const overlapStart = resolvedAlignment.timeline.teacherStart
  const overlapEnd = resolvedAlignment.timeline.teacherEnd

  if (overlapEnd <= overlapStart) {
    throw new Error('音轨偏移后两段视频没有可比较的重叠区间')
  }

  const alignedTeacherFrames = teacherFrames
    .filter((frame) => frame.timestamp >= overlapStart && frame.timestamp <= overlapEnd)
    .map((frame) => ({ ...frame, timestamp: frame.timestamp - overlapStart }))
  const alignedUserFrames = userFrames
    .map((frame) => ({
      ...frame,
      sourceTimestamp: frame.timestamp,
      teacherTimestamp: userTimeToTeacherTime(resolvedAlignment, frame.timestamp),
    }))
    .filter((frame) => frame.teacherTimestamp >= overlapStart && frame.teacherTimestamp <= overlapEnd)
    .map((frame) => ({
      ...frame,
      timestamp: frame.teacherTimestamp - overlapStart,
    }))

  return {
    teacherFrames: alignedTeacherFrames,
    userFrames: alignedUserFrames,
    overlapDurationSec: Number((overlapEnd - overlapStart).toFixed(2)),
    timeline: resolvedAlignment.timeline,
  }
}

function normalizeMapAnchors(anchors) {
  const normalized = anchors
    .filter((anchor) => Number.isFinite(anchor.teacherTime) && Number.isFinite(anchor.userTime))
    .sort((a, b) => a.teacherTime - b.teacherTime)
    .map((anchor) => ({
      teacherTime: Number(anchor.teacherTime),
      userTime: Number(anchor.userTime),
    }))

  if (normalized.length >= 2) return normalized
  const anchor = normalized[0] || { teacherTime: 0, userTime: 0 }
  return [
    anchor,
    {
      teacherTime: anchor.teacherTime + 1,
      userTime: anchor.userTime + 1,
    },
  ]
}

function teacherTimeForUserTime(anchors, userTime, fallbackSlope) {
  const first = anchors[0]
  const last = anchors.at(-1)
  if (userTime <= first.userTime) {
    return first.teacherTime + (userTime - first.userTime) / fallbackSlope
  }
  if (userTime >= last.userTime) {
    return last.teacherTime + (userTime - last.userTime) / fallbackSlope
  }
  return interpolateAnchors(anchors, userTime, 'userTime', 'teacherTime')
}

function interpolateAnchors(anchors, value, inputKey, outputKey) {
  const index = findAnchorSegment(anchors, value, inputKey)
  const start = anchors[index]
  const end = anchors[index + 1]
  const span = end[inputKey] - start[inputKey]
  if (Math.abs(span) < 0.000001) return start[outputKey]
  const ratio = (value - start[inputKey]) / span
  return start[outputKey] + ratio * (end[outputKey] - start[outputKey])
}

function findAnchorSegment(anchors, value, key) {
  if (value <= anchors[0][key]) return 0
  for (let index = 0; index < anchors.length - 1; index++) {
    if (value <= anchors[index + 1][key]) return index
  }
  return anchors.length - 2
}

function slopeBetween(start, end) {
  if (!start || !end) return 1
  const teacherSpan = end.teacherTime - start.teacherTime
  return Math.abs(teacherSpan) > 0.000001
    ? (end.userTime - start.userTime) / teacherSpan
    : 1
}

function average(values) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export {
  DEFAULT_MAX_OFFSET_SEC,
  ENVELOPE_RATE,
  alignAudioTracks,
  alignPoseFramesToAudio,
  buildOnsetEnvelope,
  commonTimeToSourceTimes,
  createAudioTimeline,
  createManualAudioAlignment,
  estimateAudioTimeline,
  findBestAudioOffset,
  localUserPlaybackRate,
  shiftAudioAlignment,
  sourceTimesToCommonTime,
  teacherTimeToUserTime,
  userTimeToTeacherTime,
}
