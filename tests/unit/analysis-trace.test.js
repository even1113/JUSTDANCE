import { describe, expect, test } from 'vitest'
import {
  completeAnalysisTrace,
  createAnalysisTrace,
  failAnalysisTrace,
  upsertAnalysisTrace,
} from '../../services/analysisTrace.js'

describe('analysis trace', () => {
  test('updates the same stepId instead of appending duplicate progress entries', () => {
    let trace = createAnalysisTrace()
    trace = upsertAnalysisTrace(trace, {
      stepId: 'pose-user',
      status: 'active',
      message: '正在检测有效帧数：10 帧。',
    })
    trace = upsertAnalysisTrace(trace, {
      stepId: 'pose-user',
      status: 'active',
      message: '正在检测有效帧数：30 帧。',
    })

    expect(trace.filter((item) => item.stepId === 'pose-user')).toHaveLength(1)
    expect(trace.find((item) => item.stepId === 'pose-user')?.message).toContain('30 帧')
  })

  test('marks the failed stage and all remaining stages as not executed', () => {
    let trace = createAnalysisTrace()
    trace = upsertAnalysisTrace(trace, {
      stepId: 'model',
      status: 'complete',
      message: '模型加载完成。',
    })
    trace = failAnalysisTrace(trace, 'pose-teacher', '推理执行失败。')

    expect(trace.find((item) => item.stepId === 'pose-teacher')?.status).toBe('error')
    expect(trace.find((item) => item.stepId === 'pose-user')?.status).toBe('skipped')
    expect(trace.find((item) => item.stepId === 'model')?.status).toBe('complete')
  })

  test('completes all successful stages without changing an error or skipped stage', () => {
    const completed = completeAnalysisTrace(createAnalysisTrace())
    expect(completed.every((item) => item.status === 'complete')).toBe(true)
  })
})
