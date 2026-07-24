import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { formatTimestamp } from '../../services/ruleReport.js'

function extractFromAppJs(functionName) {
  const appJs = readFileSync(resolve(import.meta.dirname, '../../app.js'), 'utf8')
  const pattern = new RegExp(`function ${functionName}\\([\\s\\S]*?\\n\\}`, 'm')
  return appJs.match(pattern)?.[0] || null
}

describe('utility functions', () => {
  test('escapeHtml escapes special characters', () => {
    const escapeHtml = (0, eval)(`(${extractFromAppJs('escapeHtml')})`)
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
    expect(escapeHtml('a"b')).toBe('a&quot;b')
    expect(escapeHtml('a&b')).toBe('a&amp;b')
    expect(escapeHtml("a'b")).toBe('a&#039;b')
  })

  test('formatFileSize formats bytes correctly', () => {
    const formatFileSize = (0, eval)(`(${extractFromAppJs('formatFileSize')})`)
    expect(formatFileSize(500)).toBe('0 KB')
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1536)).toBe('2 KB')
    expect(formatFileSize(1048576)).toBe('1.0 MB')
    expect(formatFileSize(1572864)).toBe('1.5 MB')
  })

  test('formatTimestamp formats seconds to MM:SS', () => {
    expect(formatTimestamp(0)).toBe('00:00')
    expect(formatTimestamp(65)).toBe('01:05')
    expect(formatTimestamp(599)).toBe('09:59')
  })
})
