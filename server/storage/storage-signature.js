import { createHmac, timingSafeEqual } from 'node:crypto'

function signStorageRequest({ method, key, expires, secret }) {
  return createHmac('sha256', secret)
    .update(`${method.toUpperCase()}\n${key}\n${expires}`)
    .digest('hex')
}

function verifyStorageRequest({ method, key, expires, signature, secret, now = Date.now() }) {
  const expiresAt = Number(expires)
  if (!Number.isInteger(expiresAt) || expiresAt * 1000 < now) return false
  if (expiresAt * 1000 > now + 24 * 60 * 60 * 1000) return false
  if (!/^[a-f0-9]{64}$/.test(String(signature || ''))) return false

  const expected = signStorageRequest({ method, key, expires: expiresAt, secret })
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export {
  signStorageRequest,
  verifyStorageRequest,
}
