import { describe, expect, test } from 'vitest'
import {
  generateFeedbackFromAnalysis,
  normalizeCoachingReport,
} from '../../services/feedbackGenerator.js'

function analysisWithIssue(issue) {
  return {
    overallScore: 76,
    poseSimilarity: 82,
    timingScore: 68,
    amplitudeScore: 79,
    controlScore: 80,
    mirroredUserVideo: false,
    audioAlignment: { overlapDurationSec: 20 },
    alignedFramePairs: [
      { teacherTimestamp: 0, userTimestamp: 0 },
      { teacherTimestamp: 8, userTimestamp: 8 },
    ],
    tracking: {
      teacher: { lostDurationSec: 0 },
      user: { lostDurationSec: 0 },
    },
    issues: [issue],
  }
}

describe('coach feedback conversion', () => {
  test('turns technical timing evidence into timeline-linked coach language', () => {
    const report = generateFeedbackFromAnalysis(analysisWithIssue({
      type: 'timing_early',
      bodyPart: 'hip',
      bodyPartLabel: '髋部',
      delayMs: -9461,
      severity: 'high',
      startTime: 7.2,
      endTime: 9.2,
      teacherTimestamp: 8,
    }))
    const issue = report.mismatches[0]
    const visibleCopy = [
      issue.title,
      issue.positive,
      issue.performance,
      issue.impact,
      issue.practice,
      issue.encouragement,
    ].join(' ')

    expect(issue.startTime).toBe(7.2)
    expect(issue.endTime).toBe(9.2)
    expect(issue.performance).toContain('早了一些')
    expect(issue.practice).toContain('0.75 倍速')
    expect(visibleCopy).not.toMatch(/9461|ms|毫秒|%|坐标|关键点/)
  })

  test('normalizes older AI fields into the fixed coach card schema', () => {
    const normalized = normalizeCoachingReport({
      mismatches: [{
        timestamp: '00:08',
        title: '停顿需要更清楚',
        teacherPath: '方向已经正确。',
        userPath: '到位后稍早放松。',
        advice: '慢速停住两拍。',
      }],
    })
    const issue = normalized.mismatches[0]

    expect(issue.startTime).toBe(8)
    expect(issue.endTime).toBe(10)
    expect(issue.positive).toBe('方向已经正确。')
    expect(issue.performance).toBe('到位后稍早放松。')
    expect(issue.practice).toBe('慢速停住两拍。')
    expect(issue.encouragement.length).toBeGreaterThan(0)
  })
})
