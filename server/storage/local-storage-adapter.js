import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { signStorageRequest, verifyStorageRequest } from './storage-signature.js'

function createLocalStorageAdapter(options) {
  const rootDir = resolve(options.rootDir)
  const signingSecret = options.signingSecret
  const urlTtlSec = options.urlTtlSec
  const maxUploadBytes = options.maxUploadBytes

  async function initialize() {
    await mkdir(rootDir, { recursive: true })
  }

  async function createUploadTarget({ key, contentType }) {
    await initialize()
    return {
      method: 'PUT',
      url: createSignedUrl('/api/storage/upload/', 'PUT', key),
      headers: { 'Content-Type': contentType },
      expiresInSec: urlTtlSec,
    }
  }

  async function createReadUrl(key) {
    await requireObject(key)
    return createSignedUrl('/api/storage/media/', 'GET', key)
  }

  async function handleSignedRequest(request, response, url) {
    const uploadPrefix = '/api/storage/upload/'
    const mediaPrefix = '/api/storage/media/'
    const isUpload = request.method === 'PUT' && url.pathname.startsWith(uploadPrefix)
    const isRead = request.method === 'GET' && url.pathname.startsWith(mediaPrefix)
    if (!isUpload && !isRead) return false

    const prefix = isUpload ? uploadPrefix : mediaPrefix
    const key = decodeURIComponent(url.pathname.slice(prefix.length))
    const valid = verifyStorageRequest({
      method: request.method,
      key,
      expires: url.searchParams.get('expires'),
      signature: url.searchParams.get('signature'),
      secret: signingSecret,
    })
    if (!valid) {
      sendText(response, 403, '上传或播放链接已失效')
      return true
    }

    try {
      if (isUpload) await receiveUpload(request, response, key)
      else await streamObject(request, response, key)
    } catch (error) {
      if (!response.headersSent) sendText(response, error.status || 500, error.status ? error.message : '存储服务暂时不可用')
      else response.destroy(error)
    }
    return true
  }

  async function receiveUpload(request, response, key) {
    const declaredLength = Number(request.headers['content-length'])
    if (Number.isFinite(declaredLength) && declaredLength > maxUploadBytes) {
      sendText(response, 413, '视频超过 500MB')
      request.resume()
      return
    }

    const target = resolveObjectPath(key)
    const temporary = `${target}.uploading`
    await mkdir(dirname(target), { recursive: true })
    let receivedBytes = 0
    const limiter = async function* limit(source) {
      for await (const chunk of source) {
        receivedBytes += chunk.length
        if (receivedBytes > maxUploadBytes) {
          const error = createStorageError('upload_too_large', 413, '视频超过 500MB')
          throw error
        }
        yield chunk
      }
    }

    try {
      await pipeline(request, limiter, createWriteStream(temporary, { flags: 'wx' }))
      await rename(temporary, target)
      response.writeHead(204, { 'Cache-Control': 'no-store' })
      response.end()
    } catch (error) {
      await rm(temporary, { force: true })
      throw error
    }
  }

  async function streamObject(request, response, key) {
    const filePath = resolveObjectPath(key)
    let fileStat
    try {
      fileStat = await stat(filePath)
    } catch {
      throw createStorageError('media_not_found', 404, '视频不存在或已清理')
    }

    const range = parseRange(request.headers.range, fileStat.size)
    if (range) {
      response.writeHead(206, {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=300',
        'Content-Length': range.end - range.start + 1,
        'Content-Range': `bytes ${range.start}-${range.end}/${fileStat.size}`,
        'Content-Type': contentTypeFromKey(key),
      })
      createReadStream(filePath, { start: range.start, end: range.end }).pipe(response)
      return
    }

    response.writeHead(200, {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=300',
      'Content-Length': fileStat.size,
      'Content-Type': contentTypeFromKey(key),
    })
    createReadStream(filePath).pipe(response)
  }

  async function getObjectInfo(key) {
    const fileStat = await requireObject(key)
    return { sizeBytes: fileStat.size, lastModified: fileStat.mtime.toISOString() }
  }

  async function uploadFile(filePath, key) {
    const target = resolveObjectPath(key)
    await mkdir(dirname(target), { recursive: true })
    await pipeline(createReadStream(filePath), createWriteStream(target))
    return getObjectInfo(key)
  }

  async function downloadToFile(key, targetPath) {
    const source = resolveObjectPath(key)
    await requireObject(key)
    await mkdir(dirname(targetPath), { recursive: true })
    await pipeline(createReadStream(source), createWriteStream(targetPath))
    return targetPath
  }

  async function removeObject(key) {
    await rm(resolveObjectPath(key), { force: true })
  }

  async function removePrefix(prefix) {
    const target = resolveObjectPath(prefix)
    await rm(target, { recursive: true, force: true })
  }

  function createSignedUrl(prefix, method, key) {
    const expires = Math.floor(Date.now() / 1000) + urlTtlSec
    const signature = signStorageRequest({ method, key, expires, secret: signingSecret })
    // Local storage is served by the same application as the H5. Returning a
    // relative URL keeps uploads on the page origin even when a reverse proxy
    // or public IP is used, and avoids leaking a development PUBLIC_BASE_URL.
    return `${prefix}${encodeURIComponent(key)}?expires=${expires}&signature=${signature}`
  }

  function resolveObjectPath(key) {
    const normalizedKey = String(key || '').replaceAll('\\', '/').replace(/^\/+/, '')
    if (!normalizedKey || normalizedKey.includes('../') || normalizedKey.includes('/..')) {
      throw createStorageError('storage_key_invalid', 400, '存储路径无效')
    }
    const target = resolve(rootDir, normalizedKey)
    const relation = relative(rootDir, target)
    if (!relation || relation.startsWith(`..${sep}`) || relation === '..') {
      throw createStorageError('storage_key_invalid', 400, '存储路径无效')
    }
    return target
  }

  async function requireObject(key) {
    try {
      const fileStat = await stat(resolveObjectPath(key))
      if (!fileStat.isFile()) throw new Error('not-file')
      return fileStat
    } catch {
      throw createStorageError('media_not_found', 404, '视频不存在或已清理')
    }
  }

  return {
    createReadUrl,
    createUploadTarget,
    downloadToFile,
    driver: 'local',
    getObjectInfo,
    handleSignedRequest,
    initialize,
    removeObject,
    removePrefix,
    uploadFile,
  }
}

function parseRange(header, size) {
  const match = String(header || '').match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return null
  const start = match[1] ? Number(match[1]) : 0
  const end = match[2] ? Number(match[2]) : size - 1
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return null
  return { start, end: Math.min(end, size - 1) }
}

function contentTypeFromKey(key) {
  if (key.endsWith('.mp4')) return 'video/mp4'
  if (key.endsWith('.m4a')) return 'audio/mp4'
  if (key.endsWith('.json')) return 'application/json; charset=utf-8'
  return 'application/octet-stream'
}

function createStorageError(code, status, message) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

function sendText(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(message)
}

export { createLocalStorageAdapter }
