import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { loadConfig } from '../config.js'

async function migrate(options = {}) {
  const config = options.config || loadConfig()
  if (!config.databaseUrl) throw new Error('缺少 DATABASE_URL，无法执行数据库迁移')
  const pool = options.pool || new pg.Pool({ connectionString: config.databaseUrl })
  const ownsPool = !options.pool

  try {
    const migrationPath = fileURLToPath(new URL('./migrations/001-initial.sql', import.meta.url))
    const sql = await readFile(migrationPath, 'utf8')
    await pool.query(sql)
  } finally {
    if (ownsPool) await pool.end()
  }
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMainModule) {
  migrate()
    .then(() => console.log('Database migrations completed'))
    .catch((error) => {
      console.error(`Database migration failed: ${error.message}`)
      process.exitCode = 1
    })
}

export { migrate }
