import { MOCK_REPORT } from '../services/mockComparisonApi.js'
import { assertValidReport } from '../services/reportSchema.js'

function createDevelopmentAnalysisProvider(options = {}) {
  const delayMs = options.delayMs ?? 80

  return {
    async run({ taskId, store }) {
      store.updateAnalysisTask(taskId, { status: 'processing', stage: 'structured_analysis' })
      await wait(delayMs)
      store.updateAnalysisTask(taskId, { status: 'processing', stage: 'model_summarizing' })
      await wait(delayMs)
      const report = assertValidReport(structuredClone(MOCK_REPORT))
      return store.updateAnalysisTask(taskId, {
        status: 'success',
        stage: 'complete',
        report,
      })
    },
  }
}

function wait(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration))
}

export { createDevelopmentAnalysisProvider }
