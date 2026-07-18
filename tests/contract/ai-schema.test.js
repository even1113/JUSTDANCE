import { describe, expect, test } from 'vitest'
import { createRuleReport } from '../../services/ruleReport.js'
import { validateStructuredAnalysis } from '../../services/structuredAnalysisSchema.js'
import { validateReport } from '../../services/reportSchema.js'
import { createStructuredAnalysisFixture } from '../fixtures/structured-analysis.js'

describe('AI input and report contracts', () => {
  test('accepts the structured action analysis sent to the model', () => {
    const result = validateStructuredAnalysis(createStructuredAnalysisFixture())

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  test('rejects raw pose and video data from the model payload', () => {
    const unsafe = createStructuredAnalysisFixture()
    unsafe.videoUrl = 'https://example.invalid/private-video.mp4'
    unsafe.issues[0].keypoints = [{ x: 0.5, y: 0.5 }]

    const result = validateStructuredAnalysis(unsafe)

    expect(result.valid).toBe(false)
    expect(result.errors.some((error) => error.includes('videoUrl'))).toBe(true)
    expect(result.errors.some((error) => error.includes('keypoints'))).toBe(true)
  })

  test('turns trusted structured evidence into a Report v1 fallback', () => {
    const analysis = createStructuredAnalysisFixture()
    const report = createRuleReport(analysis, { id: 'report_contract' })
    const result = validateReport(report, { sharedDurationSec: analysis.durationSec })

    expect(result.valid).toBe(true)
    expect(report.mismatches).toHaveLength(1)
    expect(report.mismatches[0].startTime).toBe(5.2)
    expect(JSON.stringify(report)).not.toContain('keypoints')
  })

  test('keeps a short issue at the end of the video inside the shared timeline', () => {
    const analysis = createStructuredAnalysisFixture({
      issues: [{
        type: 'end_position_jitter',
        severity: 'medium',
        bodyPart: 'torso',
        bodyPartLabel: '重心',
        startTime: 11.9,
        endTime: 12,
        evidence: { confidence: 0.8 },
      }],
    })

    const report = createRuleReport(analysis)
    const result = validateReport(report, { sharedDurationSec: analysis.durationSec })

    expect(result.valid).toBe(true)
    expect(report.mismatches[0].endTime).toBe(12)
  })
})
