import { describe, expect, test } from 'vitest'
import {
  alignPoseFramesToAudio,
  findBestAudioOffset,
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
})
