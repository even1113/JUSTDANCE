import { loadConfig } from './config.js'
import { createWorkerRuntime } from './runtime.js'

async function startWorker() {
  const config = loadConfig()
  const runtime = await createWorkerRuntime(config)
  console.log(`DanceMirror worker started with concurrency ${config.workerConcurrency}`)

  const shutdown = async () => {
    await runtime.close()
    process.exit(0)
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  return runtime
}

const isMainModule = process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll('\\', '/'))
if (isMainModule) {
  startWorker().catch((error) => {
    console.error(`Worker startup failed: ${error.code || error.message}`)
    process.exitCode = 1
  })
}

export { startWorker }
