const REPORT_SCHEMA_VERSION = '1.0'
const SEVERITIES = new Set(['high', 'medium', 'low'])
const QUALITY_LEVELS = new Set(['trusted', 'reference-only'])
const FORBIDDEN_SCORE_FIELDS = new Set([
  'score',
  'overallScore',
  'poseSimilarity',
  'timingScore',
  'amplitudeScore',
  'controlScore',
])

function validateReport(report, options = {}) {
  const errors = []
  const sharedDurationSec = Number(options.sharedDurationSec)

  if (!isPlainObject(report)) {
    return { valid: false, value: null, errors: ['report 必须是对象'] }
  }

  findForbiddenScoreFields(report).forEach((path) => {
    errors.push(`${path} 不允许包含用户评分字段`)
  })

  requireString(report, 'schemaVersion', errors)
  if (report.schemaVersion && report.schemaVersion !== REPORT_SCHEMA_VERSION) {
    errors.push(`schemaVersion 必须是 ${REPORT_SCHEMA_VERSION}`)
  }

  requireString(report, 'id', errors)
  requireString(report, 'title', errors)
  requireString(report, 'aiSummary', errors)
  requireString(report, 'safetyNote', errors)

  if (!Array.isArray(report.mismatches) || report.mismatches.length < 1 || report.mismatches.length > 3) {
    errors.push('mismatches 必须包含 1–3 条问题')
  } else {
    report.mismatches.forEach((mismatch, index) => {
      validateMismatch(mismatch, index, sharedDurationSec, errors)
    })
  }

  validateDrillPlan(report.drillPlan, errors)
  validateStringArray(report.reviewAdvice, 'reviewAdvice', errors)

  if (report.trackingGaps !== undefined && !Array.isArray(report.trackingGaps)) {
    errors.push('trackingGaps 必须是数组')
  }

  return {
    valid: errors.length === 0,
    value: errors.length === 0 ? structuredClone(report) : null,
    errors,
  }
}

function assertValidReport(report, options = {}) {
  const result = validateReport(report, options)
  if (result.valid) return result.value

  const error = new Error(`报告结构无效：${result.errors.join('；')}`)
  error.code = 'report_schema_invalid'
  error.validationErrors = result.errors
  throw error
}

function validateMismatch(mismatch, index, sharedDurationSec, errors) {
  const path = `mismatches[${index}]`
  if (!isPlainObject(mismatch)) {
    errors.push(`${path} 必须是对象`)
    return
  }

  const requiredTextFields = [
    'id',
    'timestamp',
    'title',
    'positive',
    'performance',
    'impact',
    'practice',
    'encouragement',
    'evidenceSummary',
  ]
  requiredTextFields.forEach((field) => requireString(mismatch, field, errors, path))

  const expectedPriority = index + 1
  if (!Number.isInteger(mismatch.priority) || mismatch.priority !== expectedPriority) {
    errors.push(`${path}.priority 必须按 1 开始连续升序排列`)
  }

  if (!SEVERITIES.has(mismatch.severity)) {
    errors.push(`${path}.severity 必须是 high、medium 或 low`)
  }

  if (!QUALITY_LEVELS.has(mismatch.quality)) {
    errors.push(`${path}.quality 必须是 trusted 或 reference-only`)
  }

  if (!Number.isFinite(mismatch.startTime) || mismatch.startTime < 0) {
    errors.push(`${path}.startTime 必须是非负数字`)
  }

  if (!Number.isFinite(mismatch.endTime) || mismatch.endTime <= mismatch.startTime) {
    errors.push(`${path}.endTime 必须大于 startTime`)
  }

  if (Number.isFinite(sharedDurationSec) && sharedDurationSec > 0 && mismatch.endTime > sharedDurationSec) {
    errors.push(`${path}.endTime 不能超过共享时间轴`)
  }
}

function validateDrillPlan(drillPlan, errors) {
  if (!isPlainObject(drillPlan)) {
    errors.push('drillPlan 必须是对象')
    return
  }

  if (!Number.isFinite(drillPlan.durationMin) || drillPlan.durationMin <= 0) {
    errors.push('drillPlan.durationMin 必须是正数')
  }
  validateStringArray(drillPlan.steps, 'drillPlan.steps', errors)
}

function validateStringArray(value, path, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} 必须是非空数组`)
    return
  }

  value.forEach((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') {
      errors.push(`${path}[${index}] 必须是非空字符串`)
    }
  })
}

function requireString(value, field, errors, parentPath = '') {
  const path = parentPath ? `${parentPath}.${field}` : field
  if (typeof value[field] !== 'string' || value[field].trim() === '') {
    errors.push(`${path} 必须是非空字符串`)
  }
}

function findForbiddenScoreFields(value, path = 'report', matches = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenScoreFields(item, `${path}[${index}]`, matches))
    return matches
  }

  if (!isPlainObject(value)) return matches

  Object.entries(value).forEach(([key, child]) => {
    const childPath = `${path}.${key}`
    if (FORBIDDEN_SCORE_FIELDS.has(key)) matches.push(childPath)
    findForbiddenScoreFields(child, childPath, matches)
  })

  return matches
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export {
  REPORT_SCHEMA_VERSION,
  assertValidReport,
  validateReport,
}
