import { spawn } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

async function probeMedia(filePath, options = {}) {
  const result = await runCommand(options.ffprobePath || 'ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ], {
    signal: options.signal,
    timeoutMs: options.timeoutMs || 30000,
  })

  let probe
  try {
    probe = JSON.parse(result.stdout)
  } catch {
    throw createMediaError('probe_invalid_output', '无法读取视频媒体信息')
  }
  return normalizeProbe(probe)
}

function validateMediaProbe(probe, options) {
  if (!probe.video) throw createMediaError('decode_failed', '没有检测到可处理的视频画面')
  if (!Number.isFinite(probe.durationSec) || probe.durationSec <= 0) {
    throw createMediaError('decode_failed', '无法读取视频时长')
  }
  if (probe.durationSec > options.maxDurationSec + 0.05) {
    throw createMediaError('too_long', '视频超过 3 分钟，请截取后重新上传')
  }
  if (options.role === 'teacher' && !probe.audio) {
    throw createMediaError('teacher_audio_missing', '老师视频需要包含可识别的背景音乐')
  }
  if (!probe.isSupportedContainer) {
    throw createMediaError('invalid_format', '服务端检测到文件不是有效的 MP4 或 MOV')
  }
  return probe
}

async function transcodeVideo(inputPath, outputPath, probe, options = {}) {
  await mkdir(dirname(outputPath), { recursive: true })
  const ffmpegPath = options.ffmpegPath || 'ffmpeg'
  const inputs = [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-y',
    '-i', inputPath,
  ]
  if (!probe.audio) {
    inputs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100')
  }
  const videoArgs = [
    '-map', '0:v:0',
    '-c:v', 'libx264',
    '-preset', options.preset || 'veryfast',
    '-crf', String(options.crf || 23),
    '-vf', "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30",
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
  ]
  const audioArgs = probe.audio
    ? ['-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100']
    : ['-map', '1:a:0', '-c:a', 'aac', '-b:a', '96k', '-shortest']

  await runCommand(ffmpegPath, [...inputs, ...videoArgs, ...audioArgs, outputPath], {
    signal: options.signal,
    timeoutMs: options.timeoutMs || 20 * 60 * 1000,
  })
  return outputPath
}

async function extractAudio(inputPath, outputPath, options = {}) {
  await mkdir(dirname(outputPath), { recursive: true })
  await runCommand(options.ffmpegPath || 'ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-nostdin',
    '-y',
    '-i', inputPath,
    '-vn',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    outputPath,
  ], {
    signal: options.signal,
    timeoutMs: options.timeoutMs || 5 * 60 * 1000,
  })
  return outputPath
}

async function assertFileSize(filePath, maxBytes) {
  const fileStat = await stat(filePath)
  if (fileStat.size <= 0) throw createMediaError('upload_empty', '上传的视频为空文件')
  if (fileStat.size > maxBytes) throw createMediaError('too_large', '视频超过 500MB')
  return fileStat.size
}

function normalizeProbe(probe) {
  const streams = Array.isArray(probe.streams) ? probe.streams : []
  const video = streams.find((stream) => stream.codec_type === 'video')
  const audio = streams.find((stream) => stream.codec_type === 'audio')
  const durationCandidates = [probe.format?.duration, video?.duration, audio?.duration]
    .map(Number)
    .filter(Number.isFinite)
  const durationSec = durationCandidates.length > 0 ? Math.max(...durationCandidates) : null
  const formatNames = String(probe.format?.format_name || '').split(',')

  return {
    durationSec,
    formatName: probe.format?.format_name || '',
    isSupportedContainer: formatNames.some((name) => ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'].includes(name)),
    video: video ? {
      codec: video.codec_name || null,
      width: Number(video.width) || 0,
      height: Number(video.height) || 0,
      fps: parseFrameRate(video.avg_frame_rate || video.r_frame_rate),
      pixelFormat: video.pix_fmt || null,
    } : null,
    audio: audio ? {
      codec: audio.codec_name || null,
      channels: Number(audio.channels) || null,
      sampleRate: Number(audio.sample_rate) || null,
    } : null,
  }
}

function parseFrameRate(value) {
  const [numerator, denominator = 1] = String(value || '').split('/').map(Number)
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null
  return Number((numerator / denominator).toFixed(3))
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    const stdout = []
    const stderr = []
    let settled = false

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(createMediaError('media_timeout', '视频处理超时，请换一段更短的视频'))
    }, options.timeoutMs || 60000)

    const abort = () => {
      child.kill('SIGKILL')
      const error = createMediaError('media_cancelled', '视频处理已取消')
      error.name = 'AbortError'
      finish(error)
    }

    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve(value)
    }

    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => {
      if (Buffer.concat(stderr).length < 64 * 1024) stderr.push(chunk)
    })
    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        finish(createMediaError('media_tool_missing', `找不到媒体处理工具：${command}`))
      } else {
        finish(error)
      }
    })
    child.on('close', (code) => {
      if (settled) return
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString('utf8').trim().slice(-1000)
        const error = createMediaError('media_process_failed', '视频处理失败')
        error.detail = detail
        finish(error)
        return
      }
      finish(null, {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      })
    })

    if (options.signal?.aborted) abort()
    else options.signal?.addEventListener('abort', abort, { once: true })
  })
}

function createMediaError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

export {
  assertFileSize,
  extractAudio,
  normalizeProbe,
  probeMedia,
  runCommand,
  transcodeVideo,
  validateMediaProbe,
}
