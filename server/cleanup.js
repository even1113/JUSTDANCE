import { loadConfig } from './config.js'
import { createPostgresStore } from './db/postgres-store.js'
import { createStorageAdapter } from './storage/index.js'

async function cleanupExpiredSessions(options = {}) {
  const config = options.config || loadConfig()
  if (config.runtimeMode !== 'persistent') return { deleted: 0 }
  const store = options.store || createPostgresStore({
    databaseUrl: config.databaseUrl,
    retentionHours: config.dataRetentionHours,
  })
  const storage = options.storage || createStorageAdapter(config)
  const ownsStore = !options.store
  await store.initialize()
  await storage.initialize()

  let deleted = 0
  try {
    const sessionIds = await store.listExpiredSessions(new Date())
    for (const sessionId of sessionIds) {
      await storage.removePrefix(`sessions/${sessionId}/`)
      await store.purgeSession(sessionId)
      deleted += 1
    }
    return { deleted }
  } finally {
    if (ownsStore) await store.close()
  }
}

const isMainModule = process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].replaceAll('\\', '/'))
if (isMainModule) {
  cleanupExpiredSessions()
    .then((result) => console.log(`Expired session cleanup completed: ${result.deleted}`))
    .catch((error) => {
      console.error(`Expired session cleanup failed: ${error.code || error.message}`)
      process.exitCode = 1
    })
}

export { cleanupExpiredSessions }
