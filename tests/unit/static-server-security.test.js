import { describe, expect, test } from 'vitest'
import { resolve } from 'node:path'
import { resolveRequestPath } from '../../server.js'

describe('static server path allowlist', () => {
  test('serves only browser application assets', () => {
    const rootDir = resolve('workspace')

    expect(resolveRequestPath('/', rootDir)).toBe(resolve(rootDir, 'index.html'))
    expect(resolveRequestPath('/app.js', rootDir)).toBe(resolve(rootDir, 'app.js'))
    expect(resolveRequestPath('/vendor/mediapipe/pose_landmarker_lite.task', rootDir))
      .toBe(resolve(rootDir, 'vendor/mediapipe/pose_landmarker_lite.task'))
  })

  test('blocks secrets, server code, metadata, and traversal paths', () => {
    const rootDir = resolve('workspace')

    for (const path of ['/.env', '/package.json', '/server/config.js', '/.git/config', '/../.env']) {
      expect(() => resolveRequestPath(path, rootDir)).toThrow()
    }
  })
})
