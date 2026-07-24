import { describe, expect, test } from 'vitest'
import { renderIssueCard } from '../../components/uiComponents.js'

const ISSUE = {
  id: 'issue-2',
  severity: 'medium',
  timestamp: '00:18',
  title: '转身前手臂收得有点早',
  positive: '节奏整体跟上了。',
  performance: '手臂提前回收。',
  impact: '转身轮廓变小。',
  practice: '先保持手臂打开到转身开始。',
  encouragement: '下一遍只盯这一点。',
  evidenceSummary: '手腕轨迹比老师提前进入收拢区间。',
}

describe('issue card disclosure', () => {
  test('uses an independent expanded state and unique disclosure target', () => {
    const collapsed = renderIssueCard(ISSUE, 1, { active: true, expanded: false })
    const expanded = renderIssueCard(ISSUE, 1, { active: false, expanded: true })

    expect(collapsed).toContain('timeline-active')
    expect(collapsed).toContain('aria-expanded="false"')
    expect(collapsed).toContain('aria-controls="issue-body-1"')
    expect(expanded).toContain('issue-card severity-medium expanded')
    expect(expanded).toContain('aria-expanded="true"')
    expect(expanded).toContain('id="issue-body-1"')
  })
})
