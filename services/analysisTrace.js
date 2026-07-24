const ANALYSIS_TRACE_STEPS = [
  { stepId: 'preprocess', label: '视频预处理' },
  { stepId: 'alignment', label: '音频同步' },
  { stepId: 'model', label: '加载姿态模型' },
  { stepId: 'pose-teacher', label: '识别老师视频' },
  { stepId: 'pose-user', label: '识别我的视频' },
  { stepId: 'difference', label: '定位动作差异' },
  { stepId: 'coach', label: '生成复盘建议' },
]

const TRACE_STATUS_LABELS = {
  active: '进行中',
  complete: '已完成',
  error: '失败',
  pending: '等待执行',
  skipped: '未执行',
}

function createAnalysisTrace({ alignmentMethod = 'audio', isRetry = false } = {}) {
  const completedMessages = {
    preprocess: isRetry
      ? '两段视频已完成预处理，本次重试继续使用已有视频。'
      : '两段视频已通过服务端校验并完成统一格式处理。',
    alignment: alignmentMethod === 'manual'
      ? '已使用手动动作起点完成校准。'
      : '已确定两段视频的共同动作区间。',
  }

  return ANALYSIS_TRACE_STEPS.map((step) => ({
    ...step,
    status: completedMessages[step.stepId] ? 'complete' : 'pending',
    message: completedMessages[step.stepId] || '等待前一步完成后执行。',
  }))
}

function upsertAnalysisTrace(trace, entry) {
  if (!entry?.stepId) throw new Error('分析过程步骤必须包含 stepId')

  const nextTrace = trace.map((item) => {
    if (entry.status === 'active' && item.stepId !== entry.stepId && item.status === 'active') {
      return { ...item, status: 'complete' }
    }
    return item
  })
  const index = nextTrace.findIndex((item) => item.stepId === entry.stepId)

  if (index < 0) return [...nextTrace, { ...entry }]

  nextTrace[index] = {
    ...nextTrace[index],
    ...entry,
  }
  return nextTrace
}

function failAnalysisTrace(trace, failedStepId, message) {
  const fallbackStepId = trace.some((item) => item.stepId === failedStepId)
    ? failedStepId
    : 'coach'

  return trace.map((item) => {
    if (item.stepId === fallbackStepId) {
      return {
        ...item,
        status: 'error',
        message,
      }
    }
    if (item.status === 'complete' || item.status === 'error') return item
    return {
      ...item,
      status: 'skipped',
      message: '因前一步未成功完成，本步骤未执行。',
    }
  })
}

function completeAnalysisTrace(trace) {
  return trace.map((item) => {
    if (item.status === 'error' || item.status === 'skipped') return item
    return {
      ...item,
      status: 'complete',
    }
  })
}

function traceStatusLabel(status) {
  return TRACE_STATUS_LABELS[status] || TRACE_STATUS_LABELS.pending
}

export {
  ANALYSIS_TRACE_STEPS,
  TRACE_STATUS_LABELS,
  completeAnalysisTrace,
  createAnalysisTrace,
  failAnalysisTrace,
  traceStatusLabel,
  upsertAnalysisTrace,
}
