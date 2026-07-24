import OSS from 'ali-oss'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

function createOssStorageAdapter(options) {
  const sharedOptions = {
    region: options.region,
    bucket: options.bucket,
    accessKeyId: options.accessKeyId,
    accessKeySecret: options.accessKeySecret,
    secure: true,
  }
  const client = options.client || new OSS({ ...sharedOptions, internal: options.internal })
  const signingClient = options.signingClient || (options.client
    ? client
    : new OSS({ ...sharedOptions, internal: false }))
  const urlTtlSec = options.urlTtlSec

  async function initialize() {
    const acl = await client.getBucketACL()
    if (acl.acl !== 'private') {
      const error = new Error('OSS Bucket 必须使用 private 权限')
      error.code = 'oss_bucket_not_private'
      throw error
    }
  }

  async function createUploadTarget({ key, contentType }) {
    const url = signingClient.signatureUrl(key, {
      expires: urlTtlSec,
      method: 'PUT',
      'Content-Type': contentType,
    })
    return {
      method: 'PUT',
      url,
      headers: { 'Content-Type': contentType },
      expiresInSec: urlTtlSec,
    }
  }

  async function createReadUrl(key) {
    return signingClient.signatureUrl(key, { expires: urlTtlSec, method: 'GET' })
  }

  async function getObjectInfo(key) {
    const result = await client.head(key)
    return {
      sizeBytes: Number(result.res.headers['content-length']) || 0,
      lastModified: result.res.headers['last-modified'] || null,
    }
  }

  async function uploadFile(filePath, key) {
    await client.put(key, filePath, { headers: { 'x-oss-object-acl': 'private' } })
    return getObjectInfo(key)
  }

  async function downloadToFile(key, targetPath) {
    await mkdir(dirname(targetPath), { recursive: true })
    await client.get(key, targetPath)
    return targetPath
  }

  async function removeObject(key) {
    try {
      await client.delete(key)
    } catch (error) {
      if (error.status !== 404) throw error
    }
  }

  async function removePrefix(prefix) {
    let marker
    do {
      const listed = await client.list({ prefix, marker, 'max-keys': 1000 })
      const names = (listed.objects || []).map((item) => item.name)
      if (names.length > 0) await client.deleteMulti(names, { quiet: true })
      marker = listed.nextMarker
    } while (marker)
  }

  return {
    createReadUrl,
    createUploadTarget,
    downloadToFile,
    driver: 'oss',
    getObjectInfo,
    handleSignedRequest: async () => false,
    initialize,
    removeObject,
    removePrefix,
    uploadFile,
  }
}

export { createOssStorageAdapter }
