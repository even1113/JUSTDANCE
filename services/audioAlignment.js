const ENVELOPE_RATE = 20
const DEFAULT_MAX_OFFSET_SEC = 30
const MIN_OVERLAP_SEC = 8
const MIN_CORRELATION = 0.2

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

    return {
      offsetSec: result.offsetSec,
      confidence: result.confidence,
      correlation: result.correlation,
      method: 'audio_correlation',
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

function alignPoseFramesToAudio(teacherFrames, userFrames, alignment = {}) {
  const offsetSec = Number(alignment.offsetSec) || 0
  const teacherDuration = teacherFrames.at(-1)?.timestamp || 0
  const userDuration = userFrames.at(-1)?.timestamp || 0
  const overlapStart = Math.max(0, -offsetSec)
  const overlapEnd = Math.min(teacherDuration, userDuration - offsetSec)

  if (overlapEnd <= overlapStart) {
    throw new Error('音轨偏移后两段视频没有可比较的重叠区间')
  }

  const alignedTeacherFrames = teacherFrames
    .filter((frame) => frame.timestamp >= overlapStart && frame.timestamp <= overlapEnd)
    .map((frame) => ({ ...frame, timestamp: frame.timestamp - overlapStart }))
  const alignedUserFrames = userFrames
    .filter((frame) => frame.timestamp >= overlapStart + offsetSec && frame.timestamp <= overlapEnd + offsetSec)
    .map((frame) => ({
      ...frame,
      sourceTimestamp: frame.timestamp,
      timestamp: frame.timestamp - offsetSec - overlapStart,
    }))

  return {
    teacherFrames: alignedTeacherFrames,
    userFrames: alignedUserFrames,
    overlapDurationSec: Number((overlapEnd - overlapStart).toFixed(2)),
  }
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
  findBestAudioOffset,
}
