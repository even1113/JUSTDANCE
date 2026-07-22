import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'

describe('Nginx upload proxy', () => {
  test('allows the documented video limit without buffering uploads to disk first', async () => {
    const config = await readFile('deploy/nginx/default.conf.template', 'utf8')
    const uploadLocation = config.match(/location \^~ \/api\/storage\/upload\/ \{([\s\S]*?)\n  \}/)?.[1] || ''

    expect(uploadLocation).toContain('client_max_body_size 500m;')
    expect(uploadLocation).toContain('proxy_request_buffering off;')
    expect(uploadLocation).toContain('proxy_pass http://api:5173;')
  })
})
