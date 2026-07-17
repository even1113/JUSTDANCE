const PROCESSING_STEPS = [
  { key: 'upload', label: '读取两段视频', detail: '正在检查本次选择的本地视频' },
  { key: 'transcode', label: '检查视频兼容性', detail: '确认当前浏览器能够读取完整画面' },
  { key: 'alignment', label: '自动对齐音乐', detail: '以老师视频的音乐和时间轴为基准' },
  { key: 'subject', label: '识别目标人物', detail: '确认本次需要持续跟踪的人物' },
]

const ANALYSIS_STEPS = [
  { key: 'pose', label: '提取动作结构' },
  { key: 'difference', label: '定位明显差异' },
  { key: 'coach', label: '整理成舞蹈老师式建议' },
]

const MOCK_REPORT = {
  id: 'report_demo_001',
  title: '这一遍最明显的问题，是 Wave 到腰胯时断了一下',
  aiSummary: '你的肩胸方向已经很清楚，节奏也基本跟上了。最值得先修的是 8 秒到 11 秒这段：力量到胸口后停住，腰胯没有继续接上。先把这一小段连顺，整段的流动感会明显提升。',
  mismatches: [
    {
      id: 'issue_wave',
      timestamp: '00:08',
      startTime: 8,
      endTime: 11,
      severity: 'high',
      priority: 1,
      title: 'Wave 到腰胯时断了一下',
      positive: '肩膀和胸口的方向已经做得很清楚。',
      performance: '力量传到胸口后稍微停住，腰胯没有继续接住。',
      impact: '身体的流动感会变弱，看起来像上下两段动作。',
      practice: '先用 0.75 倍速练“肩—胸—腰—胯”，每个位置停一拍，再把四个位置连起来。',
      encouragement: '上半段路线已经正确，把力量继续送下去就会顺很多。',
      evidenceSummary: '老师在这一段的躯干动作连续下移，你的动作在胸口附近出现了明显停顿。',
      quality: 'trusted',
    },
    {
      id: 'issue_arm',
      timestamp: '00:18',
      startTime: 18,
      endTime: 20.5,
      severity: 'medium',
      priority: 2,
      title: '转身前手臂收得有点早',
      positive: '转身方向和脚下节奏都跟住了。',
      performance: '进入转身前，右手比老师更早回到身体旁边。',
      impact: '动作线条会短一点，转身前的延伸感不够完整。',
      practice: '把右手想象成再向外送半拍，脚开始转时再收回来。',
      encouragement: '脚下已经稳定，只要把手臂多留一会儿，画面会更舒展。',
      evidenceSummary: '同一拍内，用户手腕到肩部的距离提前缩短。',
      quality: 'trusted',
    },
    {
      id: 'issue_finish',
      timestamp: '00:27',
      startTime: 27,
      endTime: 29.5,
      severity: 'low',
      priority: 3,
      title: '结尾重心还可以再站稳一点',
      positive: '最后一个动作的位置已经找对了。',
      performance: '落到结束动作后，身体还有一点小幅晃动。',
      impact: '定点会显得不够干净，镜头里的完成感稍弱。',
      practice: '最后一步落地后默数两拍，保持视线和胸口方向不变。',
      encouragement: '位置已经到了，把最后两拍守住就会很利落。',
      evidenceSummary: '该片段下肢有短暂遮挡，结论根据可见躯干轨迹生成。',
      quality: 'reference-only',
    },
  ],
  trackingGaps: [],
  drillPlan: {
    durationMin: 12,
    steps: [
      '3 分钟：分开练肩、胸、腰、胯四个位置',
      '5 分钟：用 0.75 倍速循环 8 秒到 11 秒',
      '4 分钟：恢复原速，只录这一小段检查是否连贯',
    ],
  },
  reviewAdvice: [
    '今天先修 Wave 的连接，不要同时改三个问题。',
    '回看时重点观察胸口之后的力量有没有继续向下走。',
  ],
  safetyNote: '以上建议仅用于舞蹈训练参考，如出现疼痛或不适请停止练习。',
}

function createComparisonSession(videoAssets) {
  return Promise.resolve({
    sessionId: `session_${Date.now()}`,
    videoAssets,
    status: 'created',
  })
}

async function processVideos({ scenario = 'standard', signal, onProgress = () => {} }) {
  const completed = []

  for (const step of PROCESSING_STEPS) {
    throwIfAborted(signal)
    onProgress({ active: step.key, completed: [...completed], steps: PROCESSING_STEPS })
    await wait(360, signal)

    if (scenario === 'blocking-error' && step.key === 'transcode') {
      throw new Error('视频处理服务暂时不可用，请稍后重试。')
    }

    completed.push(step.key)
  }

  onProgress({ active: null, completed: [...completed], steps: PROCESSING_STEPS })

  return {
    status: 'ready',
    needsSubjectSelection: scenario !== 'single-person',
    alignment: scenario === 'alignment-failed'
      ? { status: 'manual-required', offsetSec: 0, duration: 32 }
      : { status: 'ready', method: 'audio', offsetSec: 1.2, duration: 32 },
  }
}

async function analyzeComparison({ scenario = 'standard', signal, onProgress = () => {} }) {
  const completed = []

  for (const step of ANALYSIS_STEPS) {
    throwIfAborted(signal)
    onProgress({ active: step.key, completed: [...completed], steps: ANALYSIS_STEPS })
    await wait(430, signal)
    completed.push(step.key)
  }

  const report = structuredClone(MOCK_REPORT)

  if (scenario === 'model-fallback') {
    report.fallback = true
    report.aiSummary = 'AI 教练暂时没有连接成功，下面先根据已完成的动作差异分析给你一份简洁复盘。最明显的问题仍然是 8 秒到 11 秒的 Wave 连接。'
  }

  if (scenario === 'tracking-lost') {
    report.trackingGaps = [{
      videoRole: 'user',
      startTime: 18,
      endTime: 21,
      message: '我的视频 00:18—00:21 没有识别到完整身体',
      recoveryActions: ['重新选择目标人物', '重新校准', '更换视频'],
    }]
    report.mismatches = report.mismatches.filter((item) => item.id !== 'issue_arm')
  }

  return report
}

function cancelTask(controller) {
  controller?.abort()
}

async function deleteSessionData(_sessionId) {
  await wait(420)
  return { status: 'deleted' }
}

function wait(duration, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, duration)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(createAbortError())
    }, { once: true })
  })
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError()
}

function createAbortError() {
  const error = new Error('任务已取消')
  error.name = 'AbortError'
  return error
}

export {
  ANALYSIS_STEPS,
  MOCK_REPORT,
  PROCESSING_STEPS,
  analyzeComparison,
  cancelTask,
  createComparisonSession,
  deleteSessionData,
  processVideos,
}
