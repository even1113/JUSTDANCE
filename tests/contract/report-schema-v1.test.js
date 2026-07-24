import { describe, expect, test } from 'vitest'
import { createRuleReport } from '../../services/ruleReport.js'
import { REPORT_SCHEMA_VERSION, assertValidReport, validateReport } from '../../services/reportSchema.js'
import { createStructuredAnalysisFixture } from '../fixtures/structured-analysis.js'

function createReport() {
  const fixture = createStructuredAnalysisFixture()
  const [primary] = fixture.issues
  fixture.issues = [
    primary,
    { ...primary, type: 'insufficient_amplitude', severity: 'medium', bodyPart: 'right_wrist', bodyPartLabel: '右手臂', startTime: 7, endTime: 8 },
    { ...primary, type: 'end_position_jitter', severity: 'low', bodyPart: 'torso', bodyPartLabel: '躯干', startTime: 9, endTime: 10 },
  ]
  return createRuleReport(fixture, { id: 'report_contract_fixture' })
}

describe('Report v1 contract', () => {
  test('accepts the canonical coach report', () => {
    const result = validateReport(createReport(), { sharedDurationSec: 32 })

    expect(result.valid).toBe(true)
    expect(result.value.schemaVersion).toBe(REPORT_SCHEMA_VERSION)
    expect(result.errors).toEqual([])
  })

  test('rejects reports outside the one-to-three issue boundary', () => {
    const report = createReport()
    report.mismatches.push({ ...report.mismatches[2], id: 'issue_extra', priority: 4 })

    expect(validateReport(report).errors).toContain('mismatches 必须包含 1–3 条问题')
  })

  test('rejects invalid and out-of-range timeline intervals', () => {
    const report = createReport()
    report.mismatches[0].endTime = 40

    const result = validateReport(report, { sharedDurationSec: 32 })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('mismatches[0].endTime 不能超过共享时间轴')
  })

  test('rejects non-contiguous priorities', () => {
    const report = createReport()
    report.mismatches[1].priority = 3

    expect(validateReport(report).errors).toContain('mismatches[1].priority 必须按 1 开始连续升序排列')
  })

  test('rejects user-facing score fields anywhere in the report', () => {
    const report = createReport()
    report.mismatches[0].timingScore = 92

    expect(validateReport(report).errors).toContain('report.mismatches[0].timingScore 不允许包含用户评分字段')
  })

  test('throws a stable error code for invalid provider output', () => {
    const report = createReport()
    report.aiSummary = ''

    expect(() => assertValidReport(report)).toThrowError(expect.objectContaining({
      code: 'report_schema_invalid',
    }))
  })
})
