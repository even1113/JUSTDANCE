import { describe, expect, test } from 'vitest'
import {
  alignPoseFramesToAudio,
  commonTimeToSourceTimes,
  createAudioTimeline,
  createManualAudioAlignment,
  estimateAudioTimeline,
  findBestAudioOffset,
  localUserPlaybackRate,
  shiftAudioAlignment,
} from '../../services/audioAlignment.js'

describe('audio alignment', () => {
  test('finds the user audio lag from matching onset features', () => {
    const teacher = new Float32Array(120)
    const user = new Float32Array(120)
    const pulseIndexes = [12, 34, 57, 91]
    pulseIndexes.forEach((index) => {
      teacher[index] = 1
      user[index + 8] = 1
    })

    const result = findBestAudioOffset(teacher, user, {
      envelopeRate: 20,
      maxOffsetSec: 2,
      minOverlapSec: 2,
    })

    expect(result.offsetSec).toBe(0.4)
    expect(result.correlation).toBeGreaterThan(0.9)
  })

  test('rebases pose timestamps to the shared audio interval', () => {
    const teacherFrames = Array.from({ length: 11 }, (_, timestamp) => ({ timestamp }))
    const userFrames = Array.from({ length: 11 }, (_, index) => ({ timestamp: index + 2 }))
    const result = alignPoseFramesToAudio(teacherFrames, userFrames, { offsetSec: 2 })

    expect(result.teacherFrames[0].timestamp).toBe(0)
    expect(result.userFrames[0].timestamp).toBe(0)
    expect(result.userFrames[0].sourceTimestamp).toBe(2)
    expect(result.overlapDurationSec).toBe(10)
  })

  test('maps a shared timeline back to both original videos with drift correction', () => {
    const timeline = createAudioTimeline({
      offsetSec: 1.2,
      teacherDuration: 60,
      userDuration: 62,
      driftRate: 1.005,
      mapAnchors: [
        { teacherTime: 0, userTime: 1.2 },
        { teacherTime: 60, userTime: 61.5 },
      ],
    })
    const alignment = {
      offsetSec: 1.2,
      method: 'audio_correlation',
      timeline,
    }
    const pair = commonTimeToSourceTimes(alignment, 40)

    expect(pair.teacherTime).toBeCloseTo(40, 3)
    expect(pair.userTime).toBeCloseTo(41.4, 3)
    expect(localUserPlaybackRate(alignment, pair.teacherTime)).toBeCloseTo(1.005, 3)
    expect(timeline.driftSec).toBeCloseTo(0.3, 2)
  })

  test('manual nudging shifts the user source time without modifying either video', () => {
    const original = createManualAudioAlignment(2, 20, 24)
    const shifted = shiftAudioAlignment(original, 1.95, 20, 24)

    expect(commonTimeToSourceTimes(original, 5).userTime).toBeCloseTo(7, 4)
    expect(commonTimeToSourceTimes(shifted, 5).userTime).toBeCloseTo(6.95, 4)
    expect(shifted.timeline.duration).toBeGreaterThan(0)
  })

  test('detects gradual recorder drift from windowed audio anchors', () => {
    const rate = 20
    const teacher = new Float32Array(60 * rate)
    const user = new Float32Array(64 * rate)
    for (let index = 8; index < teacher.length - 8; index += 37 + (index % 23)) {
      teacher[index] = 1
      teacher[index + 1] = 0.45
      const userIndex = Math.round(index * 1.006 + rate)
      user[userIndex] = 1
      user[userIndex + 1] = 0.45
    }

    const timeline = estimateAudioTimeline(teacher, user, {
      envelopeRate: rate,
      teacherDuration: 60,
      userDuration: 64,
      baseOffsetSec: 1,
      baseCorrelation: 0.9,
    })

    expect(timeline.offsetSec).toBeCloseTo(1, 1)
    expect(timeline.driftRate).toBeGreaterThan(1.002)
    expect(timeline.driftSec).toBeGreaterThan(0.15)
    expect(timeline.measuredAnchors.length).toBeGreaterThanOrEqual(3)
  })
})
