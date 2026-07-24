import { describe, expect, test } from 'vitest'
import { isDeepSeekConfigured, loadConfig } from '../../server/config.js'

describe('runtime configuration', () => {
  test('accepts only the confirmed DeepSeek v4 models', () => {
    const config = loadConfig({
      env: {
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
        DEEPSEEK_MODEL: 'deepseek-v4-flash',
        DEEPSEEK_FALLBACK_MODEL: 'deepseek-v4-pro',
      },
    })

    expect(config.deepseek.model).toBe('deepseek-v4-flash')
    expect(config.deepseek.fallbackModel).toBe('deepseek-v4-pro')
  })

  test('rejects deprecated model aliases and partial provider configuration', () => {
    expect(() => loadConfig({
      env: {
        DEEPSEEK_API_KEY: 'test-key',
        DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
        DEEPSEEK_MODEL: 'deepseek-chat',
        DEEPSEEK_FALLBACK_MODEL: 'deepseek-v4-pro',
      },
    })).toThrow(/DEEPSEEK_MODEL/)

    expect(() => loadConfig({
      env: { DEEPSEEK_API_KEY: 'test-key' },
    })).toThrow(/DEEPSEEK_BASE_URL/)
  })

  test('allows documented model defaults without a key and uses rule fallback', () => {
    const config = loadConfig({
      env: {
        DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
        DEEPSEEK_MODEL: 'deepseek-v4-flash',
        DEEPSEEK_FALLBACK_MODEL: 'deepseek-v4-pro',
      },
    })

    expect(isDeepSeekConfigured(config)).toBe(false)
  })

  test('requires a configured media signing secret in production', () => {
    expect(() => loadConfig({
      env: { NODE_ENV: 'production' },
    })).toThrow(/MEDIA_SIGNING_SECRET/)
  })
})
