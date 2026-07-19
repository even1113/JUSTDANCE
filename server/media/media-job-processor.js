import { mkdir, rm } from 'node:fs/promises'
import { extname, join } from 'node:path'
import {
  assertFileSize,
  extractAudio,
  probeMedia,
  transcodeVideo,
  validateMediaProbe,
} from './media-tools.js'

function createMediaJobProcessor({ config, store, storage }) {
  return async function processMediaJob(job) {
    if (job.type !== 'media.prepare') return
    const video = await store.getVideoForProcessing(job.videoId)
    const workDir = join(config.storage.workDir, video.sessionId, video.id)
    const extension = safeExtension(video.inputFormat)
    const inputPath = join(workDir, `input.${extension}`)
    const outputPath = join(workDir, 'processed.mp4')
    const audioPath = join(workDir, 'audio.m4a')

    await mkdir(workDir, { recursive: true })
    try {
      await store.updateVideo(video.id, { status: 'validating', errorCode: null })
      await storage.downloadToFile(video.storageKey, inputPath)
      const actualSize = await assertFileSize(inputPath, config.media.maxVideoBytes)
      const inputProbe = validateMediaProbe(await probeMedia(inputPath, {
        ffprobePath: config.media.ffprobePath,
      }), {
        maxDurationSec: config.media.maxDurationSec,
        role: video.role,
      })

      await store.updateVideo(video.id, { status: 'transcoding' })
      await transcodeVideo(inputPath, outputPath, inputProbe, {
        ffmpegPath: config.media.ffmpegPath,
      })
      const outputProbe = await probeMedia(outputPath, { ffprobePath: config.media.ffprobePath })
      if (!outputProbe.video || outputProbe.video.codec !== 'h264' || !outputProbe.audio || outputProbe.audio.codec !== 'aac') {
        throw createMediaJobError('transcode_output_invalid', '统一格式后的视频不符合 H.264 + AAC 要求')
      }

      const processedStorageKey = `sessions/${video.sessionId}/videos/${video.id}/processed.mp4`
      await storage.uploadFile(outputPath, processedStorageKey)

      let audioStorageKey = null
      if (inputProbe.audio) {
        await extractAudio(outputPath, audioPath, { ffmpegPath: config.media.ffmpegPath })
        audioStorageKey = `sessions/${video.sessionId}/videos/${video.id}/audio.m4a`
        await storage.uploadFile(audioPath, audioStorageKey)
      }

      const current = await store.getVideoForProcessing(video.id)
      if (['deleted', 'cancelled'].includes(current.status)) return
      await store.updateVideo(video.id, {
        status: 'ready',
        processedStorageKey,
        audioStorageKey,
        metadata: {
          actualSizeBytes: actualSize,
          durationSec: outputProbe.durationSec,
          width: outputProbe.video.width,
          height: outputProbe.video.height,
          fps: outputProbe.video.fps,
          videoCodec: outputProbe.video.codec,
          audioCodec: outputProbe.audio.codec,
          hasAudio: Boolean(inputProbe.audio),
          orientation: orientationFromSize(outputProbe.video.width, outputProbe.video.height),
        },
        errorCode: null,
      })
    } catch (error) {
      await store.updateVideo(video.id, {
        status: 'error',
        errorCode: error.code || 'transcode_failed',
      }).catch(async (updateError) => {
        if (updateError.code === 'video_not_found' || updateError.code === 'session_not_found') {
          await storage.removeObject(video.storageKey).catch(() => {})
          await storage.removePrefix(`sessions/${video.sessionId}/videos/${video.id}/`).catch(() => {})
        }
      })
      throw error
    } finally {
      await rm(workDir, { recursive: true, force: true })
    }
  }
}

function safeExtension(inputFormat) {
  const extension = extname(`file.${String(inputFormat || '').toLowerCase()}`).slice(1)
  return extension === 'mov' ? 'mov' : 'mp4'
}

function orientationFromSize(width, height) {
  if (width === height) return 'square'
  return width > height ? 'landscape' : 'portrait'
}

function createMediaJobError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

export { createMediaJobProcessor }
