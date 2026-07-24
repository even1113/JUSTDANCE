import { describe, expect, test } from 'vitest'
import { createSubjectTracker, normalizeCropRect } from '../../services/subjectTracker.js'

function makePose(centerX, style = 'wide') {
  return Array.from({ length: 33 }, (_, index) => {
    const column = (index % 5) - 2
    const row = Math.floor(index / 5) - 3
    const styleOffset = style === 'wide' && [15, 16].includes(index)
      ? (index === 15 ? -0.09 : 0.09)
      : style === 'lean' && index < 17 ? row * 0.008 : 0
    return {
      x: centerX + column * 0.018 + styleOffset,
      y: 0.48 + row * 0.035,
      z: 0,
      visibility: 0.98,
    }
  })
}

function result(...poses) {
  return {
    landmarks: poses,
    worldLandmarks: poses,
  }
}

describe('subject tracker', () => {
  test('does not divide an already normalized manual crop a second time', () => {
    expect(normalizeCropRect({ x: 0.2, y: 0.1, width: 0.4, height: 0.8 }, 1920, 1080)).toEqual({
      x: 0.2,
      y: 0.1,
      width: 0.4,
      height: 0.8,
    })
  })

  test('uses the crop on the first frame and keeps the same target while people cross', () => {
    const tracker = createSubjectTracker({
      cropRect: {
        x: 50,
        y: 0,
        width: 300,
        height: 1000,
        sourceWidth: 1000,
        sourceHeight: 1000,
      },
      trackId: 'teacher-subject',
    })

    const first = tracker.select(result(makePose(0.22, 'wide'), makePose(0.78, 'lean')))
    const second = tracker.select(result(makePose(0.38, 'wide'), makePose(0.62, 'lean')))
    const crossed = tracker.select(result(makePose(0.54, 'wide'), makePose(0.46, 'lean')))

    expect(first.status).toBe('tracked')
    expect(first.candidateIndex).toBe(0)
    expect(second.candidateIndex).toBe(0)
    expect(crossed.candidateIndex).toBe(0)
    expect(crossed.trackId).toBe('teacher-subject')
  })

  test('reports lost instead of switching to a distant person and reacquires nearby', () => {
    const tracker = createSubjectTracker({ trackId: 'user-subject' })
    tracker.select(result(makePose(0.3, 'wide'), makePose(0.75, 'lean')))

    const occluded = tracker.select(result(makePose(0.78, 'lean')))
    const stillLost = tracker.select(result(makePose(0.76, 'lean')))
    const reacquired = tracker.select(result(makePose(0.34, 'wide'), makePose(0.76, 'lean')))

    expect(occluded.status).toBe('lost')
    expect(stillLost.status).toBe('lost')
    expect(reacquired.status).toBe('tracked')
    expect(reacquired.candidateIndex).toBe(0)
    expect(reacquired.trackId).toBe('user-subject')
  })

  test('keeps teacher and user tracking state independent', () => {
    const teacher = createSubjectTracker({ trackId: 'teacher-subject' })
    const user = createSubjectTracker({ trackId: 'user-subject' })

    teacher.select(result(makePose(0.2, 'wide')))
    user.select(result(makePose(0.8, 'lean')))
    const teacherLost = teacher.select(result())
    const userTracked = user.select(result(makePose(0.76, 'lean')))

    expect(teacherLost.status).toBe('lost')
    expect(userTracked.status).toBe('tracked')
    expect(teacherLost.trackId).not.toBe(userTracked.trackId)
  })
})
