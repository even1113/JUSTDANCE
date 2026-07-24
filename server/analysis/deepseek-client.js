import { assertValidReport } from '../../services/reportSchema.js'

function createDeepSeekClient(options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== 'function') throw new Error('当前 Node 环境不支持 fetch')

  async function generateReport({ structuredAnalysis, fallbackReport, signal }) {
    const models = [...new Set([options.model, options.fallbackModel].filter(Boolean))]
    let lastError

    for (const model of models) {
      const attempts = model === options.model ? options.maxRetries + 1 : 1
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          const output = await requestCompletion({ model, structuredAnalysis, signal })
          return { model, report: mergeModelCopy(output, fallbackReport) }
        } catch (error) {
          lastError = error
          if (!isRetryable(error) || attempt === attempts - 1) break
          await wait(Math.min(500 * 2 ** attempt, 2000), signal)
        }
      }
    }
    throw lastError || createModelError('deepseek_failed', 'DeepSeek 暂时不可用')
  }

  async function requestCompletion({ model, structuredAnalysis, signal }) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
    const forwardAbort = () => controller.abort()
    signal?.addEventListener('abort', forwardAbort, { once: true })

    try {
      const response = await fetchImpl(buildChatCompletionsUrl(options.baseUrl), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: buildMessages(structuredAnalysis),
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          temperature: 0.2,
          max_tokens: 1800,
          stream: false,
        }),
        signal: controller.signal,
      })
      const body = await readJsonResponse(response)
      if (!response.ok) {
        const error = createModelError(`deepseek_http_${response.status}`, 'DeepSeek 请求失败')
        error.status = response.status
        error.retryable = response.status === 408 || response.status === 429 || response.status >= 500
        throw error
      }
      const content = body.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) {
        throw createModelError('deepseek_empty_output', 'DeepSeek 没有返回报告内容')
      }
      return parseJsonContent(content)
    } catch (error) {
      if (error.name === 'AbortError' && !signal?.aborted) {
        const timeoutError = createModelError('deepseek_timeout', 'DeepSeek 请求超时')
        timeoutError.retryable = true
        throw timeoutError
      }
      throw error
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', forwardAbort)
    }
  }

  return { generateReport }
}

function buildMessages(structuredAnalysis) {
  return [
    {
      role: 'system',
      content: [
        '你是 DanceMirror 舞蹈复盘教练。',
        '只能依据用户提供的结构化动作差异改写反馈，不得补造视频事实，不得输出评分、坐标、毫秒差或医疗诊断。',
        '保持问题数量、顺序、时间区间和严重程度不变。',
        '只返回 JSON，不要 Markdown。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: '把结构化差异转换为具体、温和、可执行的中文舞蹈教练反馈',
        outputShape: {
          title: 'string',
          aiSummary: 'string',
          mismatches: [{ positive: 'string', performance: 'string', impact: 'string', practice: 'string', encouragement: 'string' }],
          drillPlan: { durationMin: 15, steps: ['string'] },
          reviewAdvice: ['string'],
          safetyNote: 'string',
        },
        structuredAnalysis,
      }),
    },
  ]
}

function mergeModelCopy(output, fallbackReport) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw createModelError('deepseek_invalid_json', 'DeepSeek 返回内容不是 JSON 对象')
  }
  const modelIssues = Array.isArray(output.mismatches) ? output.mismatches : []
  const report = {
    ...fallbackReport,
    id: createReportId(),
    title: cleanText(output.title, fallbackReport.title),
    aiSummary: cleanText(output.aiSummary, fallbackReport.aiSummary),
    mismatches: fallbackReport.mismatches.map((fallback, index) => {
      const model = modelIssues[index] || {}
      return {
        ...fallback,
        positive: cleanText(model.positive, fallback.positive),
        performance: cleanText(model.performance, fallback.performance),
        impact: cleanText(model.impact, fallback.impact),
        practice: cleanText(model.practice, fallback.practice),
        encouragement: cleanText(model.encouragement, fallback.encouragement),
        teacherPath: cleanText(model.positive, fallback.positive),
        userPath: cleanText(model.performance, fallback.performance),
        advice: cleanText(model.practice, fallback.practice),
      }
    }),
    drillPlan: {
      durationMin: Number.isFinite(output.drillPlan?.durationMin) ? output.drillPlan.durationMin : fallbackReport.drillPlan.durationMin,
      steps: cleanStringArray(output.drillPlan?.steps, fallbackReport.drillPlan.steps),
    },
    reviewAdvice: cleanStringArray(output.reviewAdvice, fallbackReport.reviewAdvice),
    safetyNote: cleanText(output.safetyNote, fallbackReport.safetyNote),
  }
  return assertValidReport(report)
}

function cleanText(value, fallback) {
  if (typeof value !== 'string') return fallback
  const cleaned = value.trim().slice(0, 500)
  return cleaned || fallback
}

function cleanStringArray(value, fallback) {
  if (!Array.isArray(value)) return fallback
  const cleaned = value
    .filter((item) => typeof item === 'string' && item.trim())
    .slice(0, 6)
    .map((item) => item.trim().slice(0, 300))
  return cleaned.length > 0 ? cleaned : fallback
}

function buildChatCompletionsUrl(baseUrl) {
  const base = String(baseUrl).replace(/\/$/, '')
  return base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`
}

async function readJsonResponse(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw createModelError('deepseek_invalid_response', 'DeepSeek 返回了无法解析的响应')
  }
}

function parseJsonContent(content) {
  const trimmed = content.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    throw createModelError('deepseek_invalid_json', 'DeepSeek 返回内容不是有效 JSON')
  }
}

function isRetryable(error) {
  return Boolean(error.retryable || error.status === 429 || error.status >= 500)
}

function wait(duration, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, duration)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      const error = new Error('任务已取消')
      error.name = 'AbortError'
      reject(error)
    }, { once: true })
  })
}

function createReportId() {
  return `report_${globalThis.crypto?.randomUUID?.() || Date.now()}`
}

function createModelError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

export {
  buildChatCompletionsUrl,
  createDeepSeekClient,
  mergeModelCopy,
}
