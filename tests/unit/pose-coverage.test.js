import { describe, expect, test } from 'vitest'
import { validatePoseCoverage } from '../../services/poseExtractor.js'

describe('pose coverage quality gate', () => {
  test('distinguishes frame extraction failure from no detected person', () => {
    expect(validatePoseCoverage({
      sampledFrames: 0,
      detectedPoseFrames: 0,
      validPoseFrames: 0,
      validPoseRatio: 0,
    }).code).toBe('pose_frame_extraction_failed')

    expect(validatePoseCoverage({
      sampledFrames: 60,
      detectedPoseFrames: 0,
      validPoseFrames: 0,
      validPoseRatio: 0,
    }).code).toBe('pose_not_detected')
  })

  test('allows intermittent misses when at least 20 percent of frames remain valid', () => {
    expect(validatePoseCoverage({
      sampledFrames: 60,
      detectedPoseFrames: 28,
      validPoseFrames: 12,
      validPoseRatio: 0.2,
    })).toEqual({ ok: true })
  })

  test('reports insufficient coverage when a person is seen but tracking is mostly lost', () => {
    const result = validatePoseCoverage({
      sampledFrames: 100,
      detectedPoseFrames: 25,
      validPoseFrames: 9,
      validPoseRatio: 0.09,
    })

    expect(result.code).toBe('pose_insufficient_frames')
    expect(result.message).toContain('9/100')
  })
})
