import { describe, expect, test, vi } from 'vitest'
import { createInlineJobQueue } from '../../server/queue/job-queue.js'

describe('embedded job queue', () => {
  test('limits concurrent processors to the configured worker capacity', async () => {
    let active = 0
    let maxActive = 0
    const processed = []
    const queue = createInlineJobQueue({
      concurrency: 2,
      async processor(job) {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 20))
        processed.push(job.taskId)
        active -= 1
      },
    })

    await Promise.all([1, 2, 3, 4].map((taskId) => queue.enqueue({
      type: 'analysis.generate',
      taskId,
    })))

    await vi.waitFor(() => expect(processed).toHaveLength(4), { timeout: 1000 })
    expect(maxActive).toBe(2)
    await queue.close()
  })

  test('removes a cancelled waiting task before it reaches the processor', async () => {
    let releaseFirst
    const processed = []
    const queue = createInlineJobQueue({
      concurrency: 1,
      async processor(job) {
        processed.push(job.taskId)
        if (job.taskId === 'first') {
          await new Promise((resolve) => {
            releaseFirst = resolve
          })
        }
      },
    })

    await queue.enqueue({ type: 'analysis.generate', taskId: 'first' })
    const second = await queue.enqueue({ type: 'analysis.generate', taskId: 'second' })
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf('function'))
    expect(await queue.cancel(second.id)).toBe(true)
    releaseFirst()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(processed).toEqual(['first'])
    await queue.close()
  })
})
