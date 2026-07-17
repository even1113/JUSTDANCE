import {
  analyzeComparison,
  processVideos,
} from '../../services/mockComparisonApi.js'

describe('mock comparison service', () => {
  test('returns one to three prioritized differences without scores', async () => {
    const report = await analyzeComparison({ scenario: 'standard' })
    expect(report.mismatches).toHaveLength(3)
    expect(report.mismatches.map((item) => item.priority)).toEqual([1, 2, 3])
    expect(report).not.toHaveProperty('score')
    expect(report).not.toHaveProperty('overallScore')
  })

  test('falls back to manual alignment when automatic matching fails', async () => {
    const result = await processVideos({ scenario: 'alignment-failed' })
    expect(result.alignment.status).toBe('manual-required')
  })

  test('suppresses a conclusion in a tracking-lost interval', async () => {
    const report = await analyzeComparison({ scenario: 'tracking-lost' })
    expect(report.trackingGaps).toHaveLength(1)
    expect(report.mismatches.some((item) => item.id === 'issue_arm')).toBe(false)
  })

  test('supports cancelling an in-flight task', async () => {
    const controller = new AbortController()
    const task = analyzeComparison({ signal: controller.signal })
    controller.abort()
    await expect(task).rejects.toMatchObject({ name: 'AbortError' })
  })
})
