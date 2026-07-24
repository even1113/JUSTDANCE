import { describe, expect, test, vi } from 'vitest'
import { createDeepSeekClient } from '../../server/analysis/deepseek-client.js'
import { createRuleReport } from '../../services/ruleReport.js'
import { createStructuredAnalysisFixture } from '../fixtures/structured-analysis.js'

describe('DeepSeek report client', () => {
  test('falls back from Flash to Pro and sends only structured analysis', async () => {
    const structuredAnalysis = createStructuredAnalysisFixture()
    const fallbackReport = createRuleReport(structuredAnalysis, { id: 'fallback_report' })
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'temporary' } }, 503))
      .mockResolvedValueOnce(jsonResponse({
        choices: [{
          message: {
            content: JSON.stringify({
              title: '左手启动可以再提前一点',
              aiSummary: '这一遍先修左手启动时机。',
              mismatches: [{
                positive: '方向已经正确。',
                performance: '启动比老师稍晚。',
                impact: '重拍会显得稍松。',
                practice: '用 0.75 倍速练 6 次。',
                encouragement: '时机练稳后会更利落。',
              }],
            }),
          },
        }],
      }))
    const client = createDeepSeekClient({
      apiKey: 'test-key',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      fallbackModel: 'deepseek-v4-pro',
      maxRetries: 0,
      timeoutMs: 1000,
      fetchImpl,
    })

    const result = await client.generateReport({ structuredAnalysis, fallbackReport })

    expect(result.model).toBe('deepseek-v4-pro')
    expect(result.report.mismatches[0].startTime).toBe(5.2)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const primaryBody = JSON.parse(fetchImpl.mock.calls[0][1].body)
    const fallbackBody = JSON.parse(fetchImpl.mock.calls[1][1].body)
    expect(primaryBody.model).toBe('deepseek-v4-flash')
    expect(fallbackBody.model).toBe('deepseek-v4-pro')
    expect(primaryBody.thinking).toEqual({ type: 'disabled' })
    expect(primaryBody.response_format).toEqual({ type: 'json_object' })
    expect(primaryBody.messages[1].content).not.toMatch(/videoUrl|keypoints|landmarks|frames/)
  })

  test('keeps evidence, intervals, and severity immutable when merging model copy', async () => {
    const structuredAnalysis = createStructuredAnalysisFixture()
    const fallbackReport = createRuleReport(structuredAnalysis)
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{
        message: {
          content: JSON.stringify({
            title: '改写标题',
            aiSummary: '改写总结',
            mismatches: [{
              startTime: 999,
              endTime: 1000,
              severity: 'low',
              positive: '动作方向清楚。',
              performance: '启动稍晚。',
              impact: '重拍不够干净。',
              practice: '慢速练习。',
              encouragement: '继续保持。',
            }],
          }),
        },
      }],
    }))
    const client = createDeepSeekClient({
      apiKey: 'test-key',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-v4-flash',
      fallbackModel: 'deepseek-v4-pro',
      maxRetries: 0,
      timeoutMs: 1000,
      fetchImpl,
    })

    const result = await client.generateReport({ structuredAnalysis, fallbackReport })
    const issue = result.report.mismatches[0]

    expect(issue.startTime).toBe(fallbackReport.mismatches[0].startTime)
    expect(issue.endTime).toBe(fallbackReport.mismatches[0].endTime)
    expect(issue.severity).toBe('high')
    expect(issue.evidenceSummary).toBe(fallbackReport.mismatches[0].evidenceSummary)
  })
})

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
