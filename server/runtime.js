import { createAnalysisTaskStore } from './analysisTaskStore.js'
import { createAnalysisJobProcessor } from './analysis/analysis-job-processor.js'
import { createDeepSeekClient } from './analysis/deepseek-client.js'
import { isDeepSeekConfigured } from './config.js'
import { createPostgresStore } from './db/postgres-store.js'
import { createMediaJobProcessor } from './media/media-job-processor.js'
import {
  createInlineJobQueue,
  createRedisJobQueue,
  createRedisJobWorker,
} from './queue/job-queue.js'
import { createStorageAdapter } from './storage/index.js'

async function createApiRuntime(config, options = {}) {
  const store = options.store || createStore(config)
  const storage = options.storage || createStorageAdapter(config)
  await store.initialize()
  await storage.initialize()

  const modelClient = options.modelClient === undefined ? createConfiguredModelClient(config) : options.modelClient
  const processor = createJobProcessor({ config, modelClient, storage, store })
  const queue = options.queue || (config.runtimeMode === 'persistent'
    ? createRedisJobQueue({ redisUrl: config.redisUrl })
    : createInlineJobQueue({
        concurrency: config.workerConcurrency,
        processor,
        onFailed: logJobFailure,
      }))
  if (typeof queue.setProcessor === 'function') queue.setProcessor(processor)
  await queue.initialize?.()

  return {
    config,
    processor,
    queue,
    storage,
    store,
    async close() {
      await queue.close()
      await store.close()
    },
  }
}

async function createWorkerRuntime(config, options = {}) {
  if (config.runtimeMode !== 'persistent') {
    throw new Error('独立 Worker 需要 RUNTIME_MODE=persistent、PostgreSQL 和 Redis')
  }
  const store = options.store || createStore(config)
  const storage = options.storage || createStorageAdapter(config)
  await store.initialize()
  await storage.initialize()
  const modelClient = options.modelClient === undefined ? createConfiguredModelClient(config) : options.modelClient
  const processor = createJobProcessor({ config, modelClient, storage, store })
  const worker = createRedisJobWorker({
    concurrency: config.workerConcurrency,
    onFailed: logJobFailure,
    processor,
    redisUrl: config.redisUrl,
  })
  await worker.initialize()

  return {
    storage,
    store,
    worker,
    async close() {
      await worker.close()
      await store.close()
    },
  }
}

function createStore(config) {
  if (config.runtimeMode === 'persistent') {
    return createPostgresStore({
      databaseUrl: config.databaseUrl,
      retentionHours: config.dataRetentionHours,
    })
  }
  return createAnalysisTaskStore({
    requireReadyVideos: true,
    retentionHours: config.dataRetentionHours,
  })
}

function createConfiguredModelClient(config) {
  if (!isDeepSeekConfigured(config)) return null
  return createDeepSeekClient({
    ...config.deepseek,
  })
}

function createJobProcessor({ config, modelClient, storage, store }) {
  const processMedia = createMediaJobProcessor({ config, storage, store })
  const processAnalysis = createAnalysisJobProcessor({ modelClient, store })
  return async (job) => {
    if (job.type === 'media.prepare') return processMedia(job)
    if (job.type === 'analysis.generate') return processAnalysis(job)
    const error = new Error(`不支持的任务类型：${job.type}`)
    error.code = 'job_type_unsupported'
    throw error
  }
}

function logJobFailure({ id, data, error }) {
  const safeId = String(id || data?.type || 'unknown')
  console.error(`Background job failed (${safeId}): ${error.code || error.message}`)
}

export {
  createApiRuntime,
  createWorkerRuntime,
}
