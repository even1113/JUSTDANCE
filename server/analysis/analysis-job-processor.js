import { assertValidStructuredAnalysis } from '../../services/structuredAnalysisSchema.js'
import { createRuleReport } from '../../services/ruleReport.js'

function createAnalysisJobProcessor({ store, modelClient = null }) {
  return async function processAnalysisJob(job) {
    if (job.type !== 'analysis.generate') return
    const task = await store.getAnalysisForProcessing(job.taskId)
    if (['success', 'fallback', 'error', 'cancelled', 'stale'].includes(task.status)) return

    try {
      await store.updateAnalysisTask(task.id, { status: 'processing', stage: 'structured_analysis' })
      const structuredAnalysis = assertValidStructuredAnalysis(task.structuredAnalysis)
      const fallbackReport = createRuleReport(structuredAnalysis)

      if (!modelClient) {
        await store.updateAnalysisTask(task.id, {
          status: 'fallback',
          stage: 'complete',
          report: fallbackReport,
          errorCode: 'model_not_configured',
          fallbackUsed: true,
        })
        return
      }

      await store.updateAnalysisTask(task.id, { status: 'processing', stage: 'model_summarizing' })
      try {
        const result = await modelClient.generateReport({
          structuredAnalysis,
          fallbackReport,
          signal: job.signal,
        })
        await store.updateAnalysisTask(task.id, {
          status: 'success',
          stage: 'complete',
          report: result.report,
          model: result.model,
          fallbackUsed: false,
          errorCode: null,
        })
      } catch (error) {
        if (error.name === 'AbortError') throw error
        await store.updateAnalysisTask(task.id, {
          status: 'fallback',
          stage: 'complete',
          report: fallbackReport,
          errorCode: error.code || 'model_failed',
          fallbackUsed: true,
        })
      }
    } catch (error) {
      if (error.name === 'AbortError') return
      await store.updateAnalysisTask(task.id, {
        status: 'error',
        stage: 'error',
        errorCode: error.code || 'analysis_failed',
      })
      throw error
    }
  }
}

export { createAnalysisJobProcessor }
