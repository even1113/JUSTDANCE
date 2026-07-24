import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import { config as loadDotEnv } from 'dotenv'

loadDotEnv({ quiet: true })

const DEEPSEEK_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro'])

function loadConfig(options = {}) {
  const env = options.env || process.env
  const rootDir = resolve(options.rootDir || process.cwd())
  const nodeEnv = env.NODE_ENV || 'development'
  const runtimeMode = env.RUNTIME_MODE || (env.DATABASE_URL && env.REDIS_URL ? 'persistent' : 'embedded')
  const storageDriver = env.STORAGE_DRIVER || 'local'
  const isProduction = nodeEnv === 'production'

  const config = {
    nodeEnv,
    runtimeMode,
    isProduction,
    host: env.HOST || '127.0.0.1',
    port: readInteger(env.PORT, 5173, 'PORT', { min: 1, max: 65535 }),
    publicBaseUrl: env.PUBLIC_BASE_URL || `http://${env.HOST || '127.0.0.1'}:${readInteger(env.PORT, 5173, 'PORT', { min: 1, max: 65535 })}`,
    dataRetentionHours: readInteger(env.DATA_RETENTION_HOURS, 24, 'DATA_RETENTION_HOURS', { min: 1, max: 168 }),
    cleanupIntervalMinutes: readInteger(env.CLEANUP_INTERVAL_MINUTES, 60, 'CLEANUP_INTERVAL_MINUTES', { min: 5, max: 1440 }),
    databaseUrl: env.DATABASE_URL || '',
    redisUrl: env.REDIS_URL || '',
    workerConcurrency: readInteger(env.WORKER_CONCURRENCY, 2, 'WORKER_CONCURRENCY', { min: 1, max: 8 }),
    storage: {
      driver: storageDriver,
      localPath: resolve(rootDir, env.LOCAL_STORAGE_PATH || 'data/media'),
      workDir: resolve(rootDir, env.WORK_DIR || 'data/work'),
      signingSecret: env.MEDIA_SIGNING_SECRET || randomBytes(32).toString('hex'),
      signingSecretConfigured: Boolean(env.MEDIA_SIGNING_SECRET),
      urlTtlSec: readInteger(env.MEDIA_URL_TTL_SEC, 900, 'MEDIA_URL_TTL_SEC', { min: 60, max: 86400 }),
      oss: {
        region: env.OSS_REGION || '',
        bucket: env.OSS_BUCKET || '',
        accessKeyId: env.OSS_ACCESS_KEY_ID || '',
        accessKeySecret: env.OSS_ACCESS_KEY_SECRET || '',
        internal: readBoolean(env.OSS_INTERNAL, false),
      },
    },
    media: {
      ffmpegPath: env.FFMPEG_PATH || 'ffmpeg',
      ffprobePath: env.FFPROBE_PATH || 'ffprobe',
      maxVideoBytes: readInteger(env.MAX_VIDEO_BYTES, 500 * 1024 * 1024, 'MAX_VIDEO_BYTES', { min: 1024 * 1024 }),
      maxDurationSec: readInteger(env.MAX_VIDEO_DURATION_SEC, 180, 'MAX_VIDEO_DURATION_SEC', { min: 1, max: 1800 }),
    },
    deepseek: {
      baseUrl: env.DEEPSEEK_BASE_URL || '',
      model: env.DEEPSEEK_MODEL || '',
      fallbackModel: env.DEEPSEEK_FALLBACK_MODEL || '',
      apiKey: env.DEEPSEEK_API_KEY || '',
      timeoutMs: readInteger(env.DEEPSEEK_TIMEOUT_MS, 45000, 'DEEPSEEK_TIMEOUT_MS', { min: 1000, max: 180000 }),
      maxRetries: readInteger(env.DEEPSEEK_MAX_RETRIES, 1, 'DEEPSEEK_MAX_RETRIES', { min: 0, max: 3 }),
    },
  }

  validateConfig(config)
  return config
}

function validateConfig(config) {
  if (!['embedded', 'persistent'].includes(config.runtimeMode)) {
    throw createConfigError('RUNTIME_MODE 必须是 embedded 或 persistent')
  }
  if (!['local', 'oss'].includes(config.storage.driver)) {
    throw createConfigError('STORAGE_DRIVER 必须是 local 或 oss')
  }
  if (config.runtimeMode === 'persistent') {
    requireValue(config.databaseUrl, 'DATABASE_URL')
    requireValue(config.redisUrl, 'REDIS_URL')
  }
  if (config.storage.driver === 'oss') {
    requireValue(config.storage.oss.region, 'OSS_REGION')
    requireValue(config.storage.oss.bucket, 'OSS_BUCKET')
    requireValue(config.storage.oss.accessKeyId, 'OSS_ACCESS_KEY_ID')
    requireValue(config.storage.oss.accessKeySecret, 'OSS_ACCESS_KEY_SECRET')
  }
  if (config.isProduction && !config.storage.signingSecretConfigured) {
    throw createConfigError('生产环境必须配置 MEDIA_SIGNING_SECRET')
  }

  if (config.deepseek.model) validateDeepSeekModel(config.deepseek.model, 'DEEPSEEK_MODEL')
  if (config.deepseek.fallbackModel) {
    validateDeepSeekModel(config.deepseek.fallbackModel, 'DEEPSEEK_FALLBACK_MODEL')
  }
  if (config.deepseek.baseUrl) {
    let url
    try {
      url = new URL(config.deepseek.baseUrl)
    } catch {
      throw createConfigError('DEEPSEEK_BASE_URL 不是有效 URL')
    }
    if (url.protocol !== 'https:') throw createConfigError('DEEPSEEK_BASE_URL 必须使用 HTTPS')
  }
  if (config.deepseek.apiKey) {
    requireValue(config.deepseek.baseUrl, 'DEEPSEEK_BASE_URL')
    requireValue(config.deepseek.model, 'DEEPSEEK_MODEL')
    requireValue(config.deepseek.fallbackModel, 'DEEPSEEK_FALLBACK_MODEL')
  }
}

function validateDeepSeekModel(value, name) {
  if (!DEEPSEEK_MODELS.has(value)) {
    throw createConfigError(`${name} 只能使用 deepseek-v4-flash 或 deepseek-v4-pro`)
  }
}

function requireValue(value, name) {
  if (!String(value || '').trim()) throw createConfigError(`缺少环境变量 ${name}`)
}

function readInteger(value, fallback, name, options = {}) {
  const parsed = value === undefined || value === '' ? fallback : Number(value)
  if (!Number.isInteger(parsed)) throw createConfigError(`${name} 必须是整数`)
  if (options.min !== undefined && parsed < options.min) throw createConfigError(`${name} 不能小于 ${options.min}`)
  if (options.max !== undefined && parsed > options.max) throw createConfigError(`${name} 不能大于 ${options.max}`)
  return parsed
}

function readBoolean(value, fallback) {
  if (value === undefined || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function createConfigError(message) {
  const error = new Error(message)
  error.code = 'configuration_invalid'
  return error
}

function isDeepSeekConfigured(config) {
  return Boolean(
    config.deepseek.baseUrl
    && config.deepseek.model
    && config.deepseek.fallbackModel
    && config.deepseek.apiKey,
  )
}

export {
  DEEPSEEK_MODELS,
  isDeepSeekConfigured,
  loadConfig,
}
