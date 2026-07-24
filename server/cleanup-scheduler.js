import { cleanupExpiredSessions } from './cleanup.js'
import { loadConfig } from './config.js'

async function startCleanupScheduler(options = {}) {
  const config = options.config || loadConfig()
  const cleanup = options.cleanup || (() => cleanupExpiredSessions({ config }))

  const run = async () => {
    try {
      const result = await cleanup()
      console.log(`Expired session cleanup completed: ${result.deleted}`)
    } catch (error) {
      console.error(`Expired session cleanup failed: ${error.code || error.message}`)
    }
  }

  await run()
  const timer = setInterval(run, config.cleanupIntervalMinutes * 60 * 1000)
  const close = () => clearInterval(timer)
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
  return { close, run }
}

const isMainModule = process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll('\\', '/'))
if (isMainModule) {
  startCleanupScheduler().catch((error) => {
    console.error(`Cleanup scheduler startup failed: ${error.code || error.message}`)
    process.exitCode = 1
  })
}

export { startCleanupScheduler }
