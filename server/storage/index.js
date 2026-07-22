import { createLocalStorageAdapter } from './local-storage-adapter.js'
import { createOssStorageAdapter } from './oss-storage-adapter.js'

function createStorageAdapter(config) {
  if (config.storage.driver === 'oss') {
    return createOssStorageAdapter({
      ...config.storage.oss,
      urlTtlSec: config.storage.urlTtlSec,
    })
  }

  return createLocalStorageAdapter({
    maxUploadBytes: config.media.maxVideoBytes,
    rootDir: config.storage.localPath,
    signingSecret: config.storage.signingSecret,
    urlTtlSec: config.storage.urlTtlSec,
  })
}

export { createStorageAdapter }
