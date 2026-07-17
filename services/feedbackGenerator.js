const ISSUE_COPY = {
  timing_delay: {
    title: (issue) => `${issue.bodyPartLabel}慢了一点`,
    positive: (issue) => `你的动作方向已经跟上老师，${issue.bodyPartLabel}的路线也基本正确。`,
    performance: (issue) => `这一拍 ${issue.bodyPartLabel} 的启动稍微晚了一点，动作到位后留给下一拍的空间不够。`,
    impact: () => '连续动作会像被上一拍轻轻拖住，卡点的利落感会变弱。',
    practice: (issue) => `先用 0.75 倍速只练这一拍，提前准备 ${issue.bodyPartLabel}，听到重拍时刚好到位，连续做 6 次。`,
    encouragement: () => '你的动作路线是对的，把启动时机再稳一点就会更有质感。',
  },
  timing_early: {
    title: (issue) => `${issue.bodyPartLabel}有一点抢拍`,
    positive: (issue) => `你的 ${issue.bodyPartLabel} 到位方向很清楚，动作也敢于做出来。`,
    performance: (issue) => `这一拍 ${issue.bodyPartLabel} 稍微早了一些，所以到位后没有把停顿完整留住。`,
    impact: () => '重拍前就把动作交出去，会让后半拍显得松，停顿不够干净。',
    practice: (issue) => `用 0.75 倍速练“准备—到位—停住”，数到重拍再完成 ${issue.bodyPartLabel}，每次停一拍。`,
    encouragement: () => '你的动作方向已经正确，把节奏控制住就会更稳、更有层次。',
  },
  insufficient_amplitude: {
    title: (issue) => `${issue.bodyPartLabel}延伸还可以更完整`,
    positive: (issue) => `你的 ${issue.bodyPartLabel} 起点和方向都能看出来，动作框架已经建立起来了。`,
    performance: (issue) => `这一段 ${issue.bodyPartLabel} 在到达终点前稍早收回，动作延伸还没有完全送出去。`,
    impact: () => '动作线条会显得偏短，力量没有完整传到最远端。',
    practice: (issue) => `先不追速度，把 ${issue.bodyPartLabel} 的起点和终点各停住一拍，再用 0.75 倍速连起来，重复 6 次。`,
    encouragement: () => '你的方向感不错，只要把终点再送远一点，画面会立刻更舒展。',
  },
  end_position_jitter: {
    title: () => 'Ending 停顿不够干净',
    positive: () => '你已经把 Ending 的主要方向做出来了，收尾动作是完整的。',
    performance: () => '最后一拍到位后，重心还有一点回弹，没有完全停住。',
    impact: () => 'Ending 的轮廓会显得松，前面累积的力量没有在最后一拍收住。',
    practice: () => '单独练最后 4 拍，每次到位后默数两拍再放松，连续做 5 次。',
    encouragement: () => '你已经有清楚的收尾方向，把最后一下稳住就会很出片。',
  },
  torso_instability: {
    title: () => '中段控制还可以更稳',
    positive: () => '你的四肢动作已经能跟上，主要动作轮廓是清楚的。',
    performance: () => '手脚到位时，胸腔和髋部之间还有额外晃动，核心没有完全把力量接住。',
    impact: () => '力量传递会显得散，动作线条不够集中。',
    practice: () => '先去掉手臂，只练胸腔和髋部的方向转换；中段能稳住后，再把手臂叠回来。',
    encouragement: () => '你的动作框架已经在了，把中段控制补上会更有力量。',
  },
  pose_similarity_gap: {
    title: () => '关键动作轮廓还不够贴合',
    positive: () => '你的主要方向和老师一致，整段动作没有跑偏。',
    performance: () => '这一处肩、髋和膝的配合还没有同时到位，动作轮廓略显松散。',
    impact: () => '关键帧不够清楚，会让动作质感和老师看起来有差距。',
    practice: () => '暂停在这一处，先只对齐肩、髋、膝三个位置；能稳定停住后，再恢复到 0.75 倍速。',
    encouragement: () => '你的大方向是对的，把这个关键帧磨清楚，整段会马上更像。',
  },
}

function generateFeedbackFromAnalysis(analysis, cropInfo = null) {
  const issues = analysis.issues.length > 0 ? analysis.issues.slice(0, 3) : [buildDefaultIssue(analysis)]
  const mismatches = issues.map((issue) => issueToMismatch(issue))
  const primary = mismatches[0]

  return normalizeCoachingReport({
    id: `pose_${Date.now()}`,
    createdAt: new Date().toISOString(),
    title: primary.title,
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
  })
}

function buildStructuredAnalysisForModel(analysis) {
  return {
    comparisonSummary: {
      strongestDimension: strongestScore(analysis).key,
      weakestDimension: weakestScore(analysis).key,
      mirroredUserVideo: analysis.mirroredUserVideo,
      timelineDurationSec: analysis.audioAlignment?.overlapDurationSec || 0,
      trackingQuality: {
        teacherLostDurationSec: analysis.tracking?.teacher?.lostDurationSec || 0,
        userLostDurationSec: analysis.tracking?.user?.lostDurationSec || 0,
      },
    },
    issues: analysis.issues.map((issue) => ({
      type: issue.type,
      bodyPart: issue.bodyPart,
      bodyPartLabel: issue.bodyPartLabel,
      severity: issue.severity,
      startTime: issue.startTime,
      endTime: issue.endTime,
      timingDirection: issue.type === 'timing_delay'
        ? 'slightly_late'
        : issue.type === 'timing_early' ? 'slightly_early' : null,
      amplitudeBand: issue.type === 'insufficient_amplitude' ? 'shorter_than_reference' : null,
    })),
  }
}

function buildSummary(analysis) {
  const strongest = strongestScore(analysis)
  const weakest = weakestScore(analysis)
  const mirrorNote = analysis.mirroredUserVideo ? '左右方向已经按镜像画面做了校正。' : ''

  return `这一遍的动作方向整体是清楚的，${strongest.label}表现相对最好。下一轮先把${weakest.label}这一项练稳，不用同时修改太多细节。${mirrorNote}`
}

function strongestScore(analysis) {
  return scoreEntries(analysis).sort((a, b) => b.value - a.value)[0]
}

function weakestScore(analysis) {
  return scoreEntries(analysis).sort((a, b) => a.value - b.value)[0]
}

function scoreEntries(analysis) {
  return [
    { key: 'pose', label: '关键动作轮廓', value: analysis.poseSimilarity },
    { key: 'timing', label: '节奏控制', value: analysis.timingScore },
    { key: 'amplitude', label: '动作延伸', value: analysis.amplitudeScore },
    { key: 'control', label: '稳定与控制', value: analysis.controlScore },
  ]
}

function issueToMismatch(issue) {
  const copy = ISSUE_COPY[issue.type] || ISSUE_COPY.pose_similarity_gap
  const startTime = Number(issue.startTime) || Math.max(0, (issue.teacherTimestamp || 0) - 0.8)
  const endTime = Math.max(startTime + 0.4, Number(issue.endTime) || startTime + 2)

  return buildCompatibleMismatch({
    startTime,
    endTime,
    title: copy.title(issue),
    positive: copy.positive(issue),
    performance: copy.performance(issue),
    impact: copy.impact(issue),
    practice: copy.practice(issue),
    encouragement: copy.encouragement(issue),
    priority: issue.severity === 'high' ? 'high' : 'medium',
  })
}

function normalizeCoachingReport(report, fallbackReport = null) {
  const fallbackIssues = fallbackReport?.mismatches || []
  const reportIssues = Array.isArray(report?.mismatches) && report.mismatches.length > 0
    ? report.mismatches
    : fallbackIssues
  const mismatches = reportIssues.map((issue, index) => {
    const fallback = fallbackIssues[index] || {}
    const startTime = numberFromTime(
      issue.startTime ?? fallback.startTime ?? issue.timestamp ?? fallback.timestamp,
    )
    const endTime = Math.max(
      startTime + 0.4,
      numberFromTime(issue.endTime ?? fallback.endTime ?? startTime + 2),
    )

    return buildCompatibleMismatch({
      ...fallback,
      ...issue,
      startTime,
      endTime,
      title: issue.title || fallback.title || '这一段需要再稳一点',
      positive: issue.positive || issue.teacherPath || fallback.positive || fallback.teacherPath || '这一段的动作方向已经基本正确。',
      performance: issue.performance || issue.userPath || fallback.performance || fallback.userPath || '主要动作已经完成，但细节还可以更清楚。',
      impact: issue.impact || fallback.impact || '这个细节会影响动作的干净程度。',
      practice: issue.practice || issue.advice || fallback.practice || fallback.advice || '先用 0.75 倍速重复这一小段。',
      encouragement: issue.encouragement || fallback.encouragement || '保持现在的方向，慢一点练会更稳。',
    })
  })

  return {
    ...fallbackReport,
    ...report,
    mismatches,
  }
}

function buildCompatibleMismatch(issue) {
  const startTime = Math.max(0, Number(issue.startTime) || 0)
  const endTime = Math.max(startTime + 0.4, Number(issue.endTime) || startTime + 2)
  return {
    ...issue,
    startTime: Number(startTime.toFixed(2)),
    endTime: Number(endTime.toFixed(2)),
    timestamp: formatTimestamp(startTime),
    positive: issue.positive,
    performance: issue.performance,
    impact: issue.impact,
    practice: issue.practice,
    encouragement: issue.encouragement,
    teacherPath: issue.positive,
    userPath: issue.performance,
    advice: issue.practice,
  }
}

function buildDefaultIssue(analysis) {
  const timestamp = analysis.alignedFramePairs[Math.floor(analysis.alignedFramePairs.length / 2)]?.teacherTimestamp ?? 0
  return {
    type: 'pose_similarity_gap',
    bodyPart: 'torso',
    bodyPartLabel: '躯干',
    severity: analysis.poseSimilarity >= 82 ? 'low' : 'medium',
    teacherTimestamp: timestamp,
    startTime: Math.max(0, timestamp - 0.8),
    endTime: timestamp + 1.2,
  }
}

function buildDrillSteps(issues) {
  const first = issues[0]

  if (first?.type === 'timing_delay' || first?.type === 'timing_early') {
    return [
      `3 分钟：只数拍子，确认 ${first.bodyPartLabel} 的准备和到位时机。`,
      `6 分钟：0.75 倍速练 ${first.bodyPartLabel} 的“准备—到位—停住”。`,
      '6 分钟：跟音乐录一遍，只检查重拍瞬间是否刚好到位。',
    ]
  }

  if (first?.type === 'insufficient_amplitude') {
    return [
      `3 分钟：定住 ${first.bodyPartLabel} 的动作起点和终点。`,
      `6 分钟：慢速把 ${first.bodyPartLabel} 的路径送完整。`,
      '6 分钟：把同一小节连起来，保持延伸同时减少多余晃动。',
    ]
  }

  return [
    '3 分钟：暂停在当前建议片段，只观察身体轮廓。',
    '6 分钟：0.75 倍速重复同一小节，先把关键动作停清楚。',
    '6 分钟：恢复原速录一遍，检查动作到位后能否稳住。',
  ]
}

function buildReviewAdvice(analysis, cropInfo) {
  const lostDuration = (analysis.tracking?.teacher?.lostDurationSec || 0)
    + (analysis.tracking?.user?.lostDurationSec || 0)
  const trackingNote = lostDuration > 0
    ? '分析中有短暂遮挡；丢失期间没有改跟其他人，建议优先复看骨架连续的片段。'
    : '两段视频的目标人物跟踪保持连续，可以直接按时间节点复看。'

  return [
    '先练当前高亮的建议，每次只修一个主要问题。',
    trackingNote,
    cropInfo
      ? '这次已按框选人物完成跟踪；下次保持相近机位，更容易比较变化。'
      : '多人或背景复杂时，先分别框选老师和自己，能减少跟错人的风险。',
  ]
}

function numberFromTime(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Number(value))
  const parts = String(value || '').split(':').map((part) => Number(part))
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) return 0
  return Math.max(0, parts[0] * 60 + parts[1])
}

function formatTimestamp(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0)
  const minutes = Math.floor(safeSeconds / 60)
  const rest = Math.floor(safeSeconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export {
  buildStructuredAnalysisForModel,
  formatTimestamp,
  generateFeedbackFromAnalysis,
  normalizeCoachingReport,
}
