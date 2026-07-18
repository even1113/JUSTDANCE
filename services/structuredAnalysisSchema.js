const STRUCTURED_ANALYSIS_VERSION = '1.0'
const SEVERITIES = new Set(['high', 'medium', 'low'])
const ISSUE_TYPES = new Set([
  'timing_delay',
  'timing_early',
  'insufficient_amplitude',
  'end_position_jitter',
  'torso_instability',
  'pose_similarity_gap',
])
const FORBIDDEN_FIELDS = new Set(['landmarks', 'worldLandmarks', 'keypoints', 'frames', 'video', 'videoUrl'])

function validateStructuredAnalysis(value) {
  const errors = []
  if (!isPlainObject(value)) return { valid: false, value: null, errors: ['structuredAnalysis 必须是对象'] }
  if (value.schemaVersion !== STRUCTURED_ANALYSIS_VERSION) errors.push(`schemaVersion 必须是 ${STRUCTURED_ANALYSIS_VERSION}`)
  if (!Number.isFinite(value.durationSec) || value.durationSec <= 0) errors.push('durationSec 必须是正数')
  if (typeof value.mirroredUserVideo !== 'boolean') errors.push('mirroredUserVideo 必须是布尔值')
  validateQuality(value.quality, errors)
  validateTrackingGaps(value.trackingGaps, errors)
  validateIssues(value.issues, value.durationSec, errors)
  findForbiddenFields(value).forEach((path) => errors.push(`${path} 不允许发送原始视频或关键点数据`))
  return {
    valid: errors.length === 0,
    value: errors.length === 0 ? structuredClone(value) : null,
    errors,
  }
}

function assertValidStructuredAnalysis(value) {
  const result = validateStructuredAnalysis(value)
  if (result.valid) return result.value
  const error = new Error(`结构化动作分析无效：${result.errors.join('；')}`)
  error.code = 'structured_analysis_invalid'
  error.status = 422
  error.validationErrors = result.errors
  throw error
}

function validateQuality(quality, errors) {
  if (!isPlainObject(quality)) {
    errors.push('quality 必须是对象')
    return
  }
  for (const field of ['teacherFrameCount', 'userFrameCount', 'alignedPairCount']) {
    if (!Number.isInteger(quality[field]) || quality[field] < 1) errors.push(`quality.${field} 必须是正整数`)
  }
  for (const field of ['teacherLostDurationSec', 'userLostDurationSec']) {
    if (!Number.isFinite(quality[field]) || quality[field] < 0) errors.push(`quality.${field} 必须是非负数字`)
  }
}

function validateTrackingGaps(gaps, errors) {
  if (!Array.isArray(gaps)) {
    errors.push('trackingGaps 必须是数组')
    return
  }
  gaps.forEach((gap, index) => {
    const path = `trackingGaps[${index}]`
    if (!isPlainObject(gap)) {
      errors.push(`${path} 必须是对象`)
      return
    }
    if (!['teacher', 'user'].includes(gap.videoRole)) errors.push(`${path}.videoRole 无效`)
    if (!Number.isFinite(gap.startTime) || gap.startTime < 0) errors.push(`${path}.startTime 无效`)
    if (!Number.isFinite(gap.endTime) || gap.endTime <= gap.startTime) errors.push(`${path}.endTime 无效`)
    if (typeof gap.reasonCode !== 'string' || !gap.reasonCode) errors.push(`${path}.reasonCode 不能为空`)
  })
}

function validateIssues(issues, durationSec, errors) {
  if (!Array.isArray(issues) || issues.length < 1 || issues.length > 5) {
    errors.push('issues 必须包含 1–5 条真实结构化差异')
    return
  }
  issues.forEach((issue, index) => {
    const path = `issues[${index}]`
    if (!isPlainObject(issue)) {
      errors.push(`${path} 必须是对象`)
      return
    }
    if (!ISSUE_TYPES.has(issue.type)) errors.push(`${path}.type 无效`)
    if (!SEVERITIES.has(issue.severity)) errors.push(`${path}.severity 无效`)
    if (typeof issue.bodyPart !== 'string' || !issue.bodyPart) errors.push(`${path}.bodyPart 不能为空`)
    if (typeof issue.bodyPartLabel !== 'string' || !issue.bodyPartLabel) errors.push(`${path}.bodyPartLabel 不能为空`)
    if (!Number.isFinite(issue.startTime) || issue.startTime < 0) errors.push(`${path}.startTime 无效`)
    if (!Number.isFinite(issue.endTime) || issue.endTime <= issue.startTime) errors.push(`${path}.endTime 无效`)
    if (Number.isFinite(durationSec) && issue.endTime > durationSec + 0.05) errors.push(`${path}.endTime 超出共享时间轴`)
    if (!isPlainObject(issue.evidence)) errors.push(`${path}.evidence 必须是对象`)
  })
}

function findForbiddenFields(value, path = 'structuredAnalysis', matches = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenFields(item, `${path}[${index}]`, matches))
    return matches
  }
  if (!isPlainObject(value)) return matches
  Object.entries(value).forEach(([key, child]) => {
    const childPath = `${path}.${key}`
    if (FORBIDDEN_FIELDS.has(key)) matches.push(childPath)
    findForbiddenFields(child, childPath, matches)
  })
  return matches
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export {
  STRUCTURED_ANALYSIS_VERSION,
  assertValidStructuredAnalysis,
  validateStructuredAnalysis,
}
