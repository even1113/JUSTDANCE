const ISSUE_COPY = {
  timing_delay: {
    title: (issue) => `${issue.bodyPartLabel}启动慢了一点`,
    teacherPath: (issue) => `老师在这个拍点已经完成 ${issue.bodyPartLabel} 的主要动作，身体节奏先到位再进入下一拍。`,
    userPath: (issue) => `你的 ${issue.bodyPartLabel} 比老师晚约 ${Math.abs(issue.delayMs)}ms，动作看起来会像是被上一拍拖住。`,
    advice: (issue) => `只练这一拍的预备动作，先用 0.5 倍速提前半拍启动 ${issue.bodyPartLabel}，连续 6 次后再跟音乐。`,
  },
  timing_early: {
    title: (issue) => `${issue.bodyPartLabel}有抢拍倾向`,
    teacherPath: (issue) => `老师在重拍到来时才把 ${issue.bodyPartLabel} 推到动作终点，节奏停顿更清楚。`,
    userPath: (issue) => `你的 ${issue.bodyPartLabel} 提前约 ${Math.abs(issue.delayMs)}ms 到位，后半拍会显得没有停顿。`,
    advice: (issue) => `跟节拍器慢练，数到重拍再完成 ${issue.bodyPartLabel}，不要把终点提前交出去。`,
  },
  insufficient_amplitude: {
    title: (issue) => `${issue.bodyPartLabel}动作幅度偏小`,
    teacherPath: (issue) => `老师的 ${issue.bodyPartLabel} 运动范围更完整，起点、延伸和收回都有清楚的层次。`,
    userPath: (issue) => `你的 ${issue.bodyPartLabel} 幅度约为老师的 ${Math.round(issue.ratio * 100)}%，动作线条会显得短。`,
    advice: (issue) => `先不追速度，把 ${issue.bodyPartLabel} 的起点和终点单独定住 2 秒，再用 0.75 倍速串起来。`,
  },
  end_position_jitter: {
    title: () => 'Ending 定格不够稳',
    teacherPath: () => '老师在结束拍把重心和髋部收住，定格后没有多余回弹。',
    userPath: () => '你的髋部在最后几帧还有轻微晃动，收尾看起来不够干净。',
    advice: () => '最后 4 拍单独练 5 次，每次定格后默数 2 秒，再放松身体。',
  },
  torso_instability: {
    title: () => '躯干控制需要更稳定',
    teacherPath: () => '老师的躯干角度变化更集中，发力从核心向四肢传出去。',
    userPath: () => '你的躯干有额外摆动，手脚到位时核心没有完全收住。',
    advice: () => '先去掉手臂，只练胸腔和髋部的方向，确认核心稳定后再叠加手臂。',
  },
  pose_similarity_gap: {
    title: () => '整体姿态角度和老师不够贴合',
    teacherPath: () => '老师在关键帧里肩、髋、膝的角度衔接更一致，动作轮廓更清楚。',
    userPath: () => '你的关节角度和老师有差距，主要影响动作线条的干净程度。',
    advice: () => '暂停在这一帧，对镜只修肩、髋、膝三个角度，确认轮廓贴近后再恢复速度。',
  },
}

function generateFeedbackFromAnalysis(analysis, cropInfo = null) {
  const issues = analysis.issues.length > 0 ? analysis.issues.slice(0, 3) : [buildDefaultIssue(analysis)]
  const mismatches = issues.map((issue) => issueToMismatch(issue))
  const primary = mismatches[0]

  return {
    id: `pose_${Date.now()}`,
    createdAt: new Date().toISOString(),
    title: `${primary.title}，综合得分 ${analysis.overallScore}`,
    aiSummary: buildSummary(analysis),
    mismatches,
    drillPlan: {
      durationMin: 15,
      steps: buildDrillSteps(issues),
    },
    reviewAdvice: buildReviewAdvice(analysis, cropInfo),
    scores: {
      overallScore: analysis.overallScore,
      poseSimilarity: analysis.poseSimilarity,
      timingScore: analysis.timingScore,
      amplitudeScore: analysis.amplitudeScore,
      controlScore: analysis.controlScore,
    },
    structuredAnalysis: buildStructuredAnalysisForModel(analysis),
    safetyNote: '以上建议仅用于舞蹈训练参考，如出现疼痛或不适请停止练习。',
  }
}

function buildStructuredAnalysisForModel(analysis) {
  return {
    overallScore: analysis.overallScore,
    poseSimilarity: analysis.poseSimilarity,
    timingScore: analysis.timingScore,
    amplitudeScore: analysis.amplitudeScore,
    controlScore: analysis.controlScore,
    mirroredUserVideo: analysis.mirroredUserVideo,
    audioAlignment: analysis.audioAlignment,
    alignedFramePairs: analysis.alignedFramePairs,
    issues: analysis.issues.map((issue) => ({
      type: issue.type,
      bodyPart: issue.bodyPart,
      delayMs: issue.delayMs,
      ratio: issue.ratio,
      severity: issue.severity,
      timestamp: formatTimestamp(issue.teacherTimestamp ?? 0),
    })),
  }
}

function buildSummary(analysis) {
  const strongest = strongestScore(analysis)
  const weakest = weakestScore(analysis)
  const mirrorNote = analysis.mirroredUserVideo ? '系统已按镜像视频自动校正左右方向。' : ''

  const offset = Number(analysis.audioAlignment?.offsetSec) || 0
  const audioNote = `系统先按音轨校正了 ${Math.abs(offset).toFixed(2)} 秒的剪辑偏移，再进行姿态和 DTW 对齐。`

  return `这次比对使用 MediaPipe 逐帧提取全部 33 个关键点。${audioNote}${mirrorNote} ${strongest.label}相对最好，${weakest.label}是下一轮最值得优先修的部分。`
}

function strongestScore(analysis) {
  return scoreEntries(analysis).sort((a, b) => b.value - a.value)[0]
}

function weakestScore(analysis) {
  return scoreEntries(analysis).sort((a, b) => a.value - b.value)[0]
}

function scoreEntries(analysis) {
  return [
    { label: '姿态相似度', value: analysis.poseSimilarity },
    { label: '节奏准确度', value: analysis.timingScore },
    { label: '动作幅度', value: analysis.amplitudeScore },
    { label: '稳定与控制', value: analysis.controlScore },
  ]
}

function issueToMismatch(issue) {
  const copy = ISSUE_COPY[issue.type] || ISSUE_COPY.pose_similarity_gap

  return {
    timestamp: formatTimestamp(issue.teacherTimestamp ?? 0),
    title: copy.title(issue),
    teacherPath: copy.teacherPath(issue),
    userPath: copy.userPath(issue),
    advice: copy.advice(issue),
    priority: issue.severity === 'high' ? 'high' : 'medium',
  }
}

function buildDefaultIssue(analysis) {
  return {
    type: 'pose_similarity_gap',
    bodyPart: 'torso',
    bodyPartLabel: '躯干',
    severity: analysis.poseSimilarity >= 82 ? 'low' : 'medium',
    teacherTimestamp: analysis.alignedFramePairs[Math.floor(analysis.alignedFramePairs.length / 2)]?.teacherTimestamp ?? 0,
  }
}

function buildDrillSteps(issues) {
  const first = issues[0]

  if (first?.type === 'timing_delay' || first?.type === 'timing_early') {
    return [
      `3 分钟：只数拍子，不加手脚，确认 ${first.bodyPartLabel} 的启动点。`,
      `6 分钟：0.5 倍速练 ${first.bodyPartLabel} 的预备和到位，避免提前或滞后。`,
      '6 分钟：恢复 0.75 倍速录一遍，重点看重拍瞬间是否同时到位。',
    ]
  }

  if (first?.type === 'insufficient_amplitude') {
    return [
      `3 分钟：定住 ${first.bodyPartLabel} 的动作起点和终点。`,
      `6 分钟：慢速把 ${first.bodyPartLabel} 的路径做完整，不急着跟音乐。`,
      '6 分钟：把同一小节连起来，保持幅度但减少多余晃动。',
    ]
  }

  return [
    '3 分钟：暂停在问题最明显的时间点，只观察身体轮廓和老师的差异。',
    '6 分钟：0.5 倍速重复同一小节，让肩、髋、膝的角度逐步贴近老师。',
    '6 分钟：恢复 0.75 倍速录一遍，检查 Ending 是否能停稳 2 秒。',
  ]
}

function buildReviewAdvice(analysis, cropInfo) {
  return [
    '先看分数最低的维度，不要同时修节奏、幅度和表情。',
    `本次已完成 ${analysis.alignedFramePairs.length} 组动作对齐，可优先点击时间点回看差异最大的片段。`,
    cropInfo
      ? '这次已框选本人区域；下一次保持相同机位，方便比较进步。'
      : '多人或背景复杂时，先用「框选自己」让姿态识别更稳定。',
  ]
}

function formatTimestamp(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0)
  const minutes = Math.floor(safeSeconds / 60)
  const rest = Math.floor(safeSeconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export {
  generateFeedbackFromAnalysis,
  buildStructuredAnalysisForModel,
  formatTimestamp,
}
