import { Queue, Worker } from 'bullmq'
import IORedis from 'ioredis'

const QUEUE_NAME = 'dancemirror-jobs'

function createRedisJobQueue(options) {
  const connection = options.connection || createRedisConnection(options.redisUrl)
  const ownsConnection = !options.connection
  const queue = new Queue(QUEUE_NAME, { connection, prefix: options.prefix || 'dancemirror' })

  async function enqueue(job) {
    const idPart = job.videoId || job.taskId || job.sessionId || Date.now()
    return queue.add(job.type, job, {
      attempts: job.attempts || 2,
      backoff: { type: 'exponential', delay: 2000 },
      jobId: `${job.type}__${idPart}__${job.inputVersion ?? 0}`,
      removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 },
    })
  }

  async function cancel(jobId) {
    const job = await queue.getJob(jobId)
    if (!job) return false
    try {
      await job.remove()
      return true
    } catch {
      return false
    }
  }

  async function initialize() {
    await queue.waitUntilReady()
  }

  async function checkHealth() {
    const client = await queue.client
    await client.ping()
  }

  async function close() {
    await queue.close()
    if (ownsConnection) connection.disconnect()
  }

  return { cancel, checkHealth, close, enqueue, initialize, queue }
}

function createRedisJobWorker(options) {
  const connection = options.connection || createRedisConnection(options.redisUrl)
  const ownsConnection = !options.connection
  const worker = new Worker(QUEUE_NAME, async (job) => options.processor(job.data), {
    concurrency: options.concurrency || 1,
    connection,
    prefix: options.prefix || 'dancemirror',
  })

  async function initialize() {
    await worker.waitUntilReady()
  }

  worker.on('failed', (job, error) => {
    options.onFailed?.({ id: job?.id, data: job?.data, error })
  })

  async function close() {
    await worker.close()
    if (ownsConnection) connection.disconnect()
  }

  return { close, initialize, worker }
}

function createInlineJobQueue(options = {}) {
  let processor = options.processor || null
  const concurrency = Math.max(1, Number(options.concurrency) || 1)
  const pending = new Map()
  const waiting = []
  let activeCount = 0
  let scheduled = false

  function setProcessor(nextProcessor) {
    processor = nextProcessor
    schedule()
  }

  async function enqueue(job) {
    const idPart = job.videoId || job.taskId || job.sessionId || Date.now()
    const id = `${job.type}__${idPart}__${job.inputVersion ?? 0}`
    const controller = new AbortController()
    pending.set(id, { controller, job, status: 'waiting' })
    waiting.push(id)
    schedule()
    return { id }
  }

  function schedule() {
    if (scheduled) return
    scheduled = true
    setTimeout(drain, 0)
  }

  function drain() {
    scheduled = false
    while (processor && activeCount < concurrency && waiting.length > 0) {
      const id = waiting.shift()
      const entry = pending.get(id)
      if (!entry || entry.controller.signal.aborted) continue
      entry.status = 'active'
      activeCount += 1
      processEntry(id, entry)
    }
  }

  async function processEntry(id, entry) {
    const { controller, job } = entry
    try {
      await processor({ ...job, signal: controller.signal })
    } catch (error) {
      options.onFailed?.({ id, data: job, error })
    } finally {
      activeCount -= 1
      pending.delete(id)
      schedule()
    }
  }

  async function cancel(id) {
    const entry = pending.get(id)
    if (!entry) return false
    entry.controller.abort()
    if (entry.status === 'waiting') pending.delete(id)
    schedule()
    return true
  }

  async function close() {
    for (const entry of pending.values()) entry.controller.abort()
    waiting.length = 0
    pending.clear()
  }

  return {
    cancel,
    checkHealth: async () => {},
    close,
    enqueue,
    initialize: async () => {},
    setProcessor,
  }
}

/*
 * The embedded queue intentionally mirrors the production worker concurrency.
 * It stays process-local, but it must not launch an unbounded number of FFmpeg
 * jobs when multiple uploads finish together.
 */

function createRedisConnection(redisUrl) {
  return new IORedis(redisUrl, {
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
  })
}

export {
  QUEUE_NAME,
  createInlineJobQueue,
  createRedisJobQueue,
  createRedisJobWorker,
}
