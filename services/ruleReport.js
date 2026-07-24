import { assertValidStructuredAnalysis } from './structuredAnalysisSchema.js'
import { assertValidReport } from './reportSchema.js'

const ISSUE_RULES = {
  timing_delay: {
    title: (issue) => `${issue.bodyPartLabel}启动稍微晚了一点`,
    positive: (issue) => `你的${issue.bodyPartLabel}方向已经跟上老师，主要动作路线是清楚的。`,
    performance: (issue) => `这一段${issue.bodyPartLabel}的启动晚于老师对应动作，到位后留给下一拍的时间偏少。`,
    impact: () => '连续动作会被上一拍轻轻拖住，重拍的利落感会变弱。',
    practice: (issue) => `用 0.75 倍速只练这一拍，提前准备${issue.bodyPartLabel}，听到重拍时刚好到位，连续做 6 次。`,
    encouragement: () => '动作方向已经正确，把启动时机练稳后会更干净。',
    evidence: (issue) => `${issue.bodyPartLabel}在对齐后的对应动作中比老师更晚启动。`,
  },
  timing_early: {
    title: (issue) => `${issue.bodyPartLabel}有一点抢拍`,
    positive: (issue) => `你的${issue.bodyPartLabel}到位方向很清楚，动作也敢于做出来。`,
    performance: (issue) => `这一段${issue.bodyPartLabel}比老师更早启动，到位后没有把停顿完整留住。`,
    impact: () => '重拍前就把动作交出去，会让后半拍显得松，停顿不够干净。',
    practice: (issue) => `用 0.75 倍速练“准备—到位—停住”，数到重拍再完成${issue.bodyPartLabel}。`,
    encouragement: () => '控制住节奏后，现有动作方向会显得更稳、更有层次。',
    evidence: (issue) => `${issue.bodyPartLabel}在对齐后的对应动作中比老师更早启动。`,
  },
  insufficient_amplitude: {
    title: (issue) => `${issue.bodyPartLabel}延伸还可以更完整`,
    positive: (issue) => `你的${issue.bodyPartLabel}起点和方向都能看出来，动作框架已经建立起来了。`,
    performance: (issue) => `这一段${issue.bodyPartLabel}在到达终点前稍早收回，运动范围小于老师对应动作。`,
    impact: () => '动作线条会显得偏短，力量没有完整传到最远端。',
    practice: (issue) => `先不追速度，把${issue.bodyPartLabel}的起点和终点各停住一拍，再用 0.75 倍速连起来。`,
    encouragement: () => '把终点再送远一点，画面会立刻更舒展。',
    evidence: (issue) => `${issue.bodyPartLabel}的归一化运动范围小于老师对应片段。`,
  },
  end_position_jitter: {
    title: () => '收尾停顿还可以更干净',
    positive: () => '你已经把收尾的主要方向做出来了，动作是完整的。',
    performance: () => '最后一拍到位后，重心还有额外位移，没有完全停住。',
    impact: () => '收尾轮廓会显得偏松，前面累积的力量没有在最后一拍收住。',
    practice: () => '单独练最后 4 拍，每次到位后默数两拍再放松，连续做 5 次。',
    encouragement: () => '收尾方向已经清楚，把最后一下稳住就会更利落。',
    evidence: () => '用户在动作结束位置的额外位移高于老师对应片段。',
  },
  torso_instability: {
    title: () => '中段方向还可以更稳定',
    positive: () => '你的四肢动作已经能跟上，主要动作轮廓是清楚的。',
    performance: () => '手脚到位时，躯干方向仍有额外波动，动作没有完全聚拢。',
    impact: () => '力量传递会显得分散，动作线条不够集中。',
    practice: () => '先去掉手臂，只练胸腔和髋部的方向转换；稳定后再把手臂叠回来。',
    encouragement: () => '动作框架已经在了，把中段方向练稳后会更有力量。',
    evidence: () => '用户躯干方向在这一段的波动高于老师对应片段。',
  },
  pose_similarity_gap: {
    title: () => '关键动作轮廓还不够贴合',
    positive: () => '你的主要动作方向与老师一致，整段没有明显跑偏。',
    performance: () => '这一处肩、髋和膝的相对位置没有同时到位，动作轮廓略显松散。',
    impact: () => '关键动作轮廓不够清楚，会让这一拍的质感与老师看起来有差距。',
    practice: () => '暂停在这一处，先只对齐肩、髋、膝三个位置；稳定后再恢复到 0.75 倍速。',
    encouragement: () => '大方向已经正确，把这个动作轮廓磨清楚，整段会马上更贴合。',
    evidence: () => '对齐后的肩、髋和膝部轮廓与老师对应动作存在明显差异。',
  },
}

function createRuleReport(structuredAnalysis, options = {}) {
  const analysis = assertValidStructuredAnalysis(structuredAnalysis)
  const mismatches = analysis.issues.slice(0, 3).map((issue, index) => {
    return issueToMismatch(issue, index, analysis.durationSec)
  })
  const primary = mismatches[0]
  const report = {
    schemaVersion: '1.0',
    id: options.id || createId('report'),
    title: primary.title,
    aiSummary: `这次先看“${primary.title}”。它是当前结构化分析里最明显、也最适合通过回放验证的一处差异。`,
    mismatches,
    drillPlan: {
      durationMin: 15,
      steps: [
        `3 分钟：回看 ${primary.timestamp} 附近，只确认当前动作差异。`,
        `6 分钟：${primary.practice}`,
        '6 分钟：恢复原速录一遍，只检查这一处是否更清楚。',
      ],
    },
    reviewAdvice: [
      '先点击最重要的差异节点，对照老师和自己的同一小段。',
      '每次只修一个问题，不要同时调整所有细节。',
      '下一次录制尽量固定机位并保持全身入镜。',
    ],
    trackingGaps: analysis.trackingGaps.map((gap) => ({
      ...gap,
      message: `${gap.videoRole === 'teacher' ? '老师' : '用户'}视频在 ${formatTimestamp(gap.startTime)}—${formatTimestamp(gap.endTime)} 未稳定识别到完整身体`,
    })),
    safetyNote: '以上建议仅用于舞蹈训练参考，如出现疼痛或不适请停止练习。',
  }
  return assertValidReport(report, { sharedDurationSec: analysis.durationSec })
}

function issueToMismatch(issue, index, durationSec) {
  const rule = ISSUE_RULES[issue.type] || ISSUE_RULES.pose_similarity_gap
  const startTime = Number(Math.max(0, issue.startTime).toFixed(2))
  const endTime = Number(Math.min(
    durationSec,
    Math.max(startTime + 0.4, issue.endTime),
  ).toFixed(2))
  return {
    id: `issue_${index + 1}`,
    timestamp: formatTimestamp(startTime),
    startTime,
    endTime,
    title: rule.title(issue),
    positive: rule.positive(issue),
    performance: rule.performance(issue),
    impact: rule.impact(issue),
    practice: rule.practice(issue),
    encouragement: rule.encouragement(issue),
    priority: index + 1,
    severity: issue.severity,
    evidenceSummary: rule.evidence(issue),
    quality: 'trusted',
    teacherPath: rule.positive(issue),
    userPath: rule.performance(issue),
    advice: rule.practice(issue),
  }
}

function formatTimestamp(seconds) {
  const value = Math.max(0, Number(seconds) || 0)
  const minutes = Math.floor(value / 60)
  const rest = Math.floor(value % 60)
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

function createId(prefix) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() || Date.now()}`
}

export { createRuleReport, formatTimestamp }
