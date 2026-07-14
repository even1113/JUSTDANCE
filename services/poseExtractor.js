import { drawPoseFrame } from '../components/PoseCanvas.js'
import { createPoseLandmarker } from '../hooks/usePoseLandmarker.js'
import { analyzeMovementMetrics } from './movementMetrics.js'

const POSE_PLAYBACK_RATE = 1

async function runPoseComparison({
  teacherVideo,
  userVideo,
  teacherCanvas,
  userCanvas,
  cropInfo,
  onProgress = () => {},
}) {
  if (!teacherVideo || !userVideo) {
    throw new Error('请先添加老师视频和我的视频')
  }

  onProgress('正在加载 MediaPipe Pose Landmarker...')

  const teacherHistory = []
  const userHistory = []

  onProgress('正在识别老师视频的人体姿态...')
  const teacherPoseFrames = await extractPoseFrames(teacherVideo, {
    label: '老师',
    canvas: teacherCanvas,
    color: '#b7f34a',
    history: teacherHistory,
    onProgress,
  })

  onProgress(cropInfo ? '正在识别我的视频姿态（已使用框选主体提示）...' : '正在识别我的视频姿态...')
  const userPoseFrames = await extractPoseFrames(userVideo, {
    label: '我的',
    canvas: userCanvas,
    color: '#ff5a7a',
    history: userHistory,
    onProgress,
  })

  onProgress('正在做身体比例归一化、平滑和关键点补帧...')
  onProgress('正在通过 DTW 对齐老师和我的动作序列...')
  const analysis = analyzeMovementMetrics(teacherPoseFrames, userPoseFrames)

  return {
    ...analysis,
    poseFrameCounts: {
      teacher: teacherPoseFrames.length,
      user: userPoseFrames.length,
    },
  }
}

async function extractPoseFrames(video, options = {}) {
  const {
    label = '视频',
    canvas = null,
    color = '#b7f34a',
    history = [],
    onProgress = () => {},
  } = options

  if (!video.requestVideoFrameCallback) {
    throw new Error('当前浏览器不支持 requestVideoFrameCallback，无法按视频帧进行姿态识别。')
  }

  const originalState = {
    currentTime: video.currentTime,
    muted: video.muted,
    playbackRate: video.playbackRate,
  }
  await ensureVideoReady(video)
  await seekVideo(video, 0)

  const landmarker = await createPoseLandmarker()
  const frames = []

  video.muted = true
  video.playbackRate = POSE_PLAYBACK_RATE

  return new Promise((resolve, reject) => {
    let finished = false
    let frameRequestId = null
    let lastTimestampMs = -1

    const cleanup = async () => {
      video.removeEventListener('ended', finish)
      video.removeEventListener('error', failFromVideo)
      if (frameRequestId !== null && video.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(frameRequestId)
      }
      video.pause()
      video.muted = originalState.muted
      video.playbackRate = originalState.playbackRate
      if (typeof landmarker.close === 'function') landmarker.close()
      await seekVideo(video, originalState.currentTime)
    }

    const finish = () => {
      if (finished) return
      finished = true

      cleanup()
        .then(() => {
          if (frames.length === 0) {
            reject(new Error(`${label}视频未检测到人体姿态，请确认人物完整入镜且光线清晰。`))
            return
          }
          resolve(frames)
        })
        .catch(reject)
    }

    const fail = (error) => {
      if (finished) return
      finished = true
      cleanup().finally(() => reject(error))
    }

    const failFromVideo = () => {
      fail(new Error(`${label}视频读取失败，请重新选择视频。`))
    }

    const handleFrame = (_now, metadata) => {
      if (finished) return

      try {
        const mediaTime = metadata.mediaTime ?? video.currentTime
        const timestampMs = Math.round(mediaTime * 1000)

        if (timestampMs > lastTimestampMs) {
          lastTimestampMs = timestampMs
          const result = landmarker.detectForVideo(video, timestampMs)
          const frame = buildPoseFrame(result, mediaTime)

          if (frame) {
            frames.push(frame)
            history.push(frame)
            if (canvas) drawPoseFrame(canvas, video, frame, history, { color })
            if (frames.length % 30 === 0) {
              onProgress(`${label}视频已识别 ${frames.length} 帧姿态...`)
            }
          }
        }

        if (video.ended || mediaTime >= (video.duration || mediaTime) - 0.02) {
          finish()
          return
        }

        frameRequestId = video.requestVideoFrameCallback(handleFrame)
      } catch (error) {
        fail(error)
      }
    }

    video.addEventListener('ended', finish)
    video.addEventListener('error', failFromVideo)
    frameRequestId = video.requestVideoFrameCallback(handleFrame)
    video.play().catch((error) => {
      fail(new Error(`${label}视频无法自动播放以进行逐帧识别：${error.message}`))
    })
  })
}

function buildPoseFrame(result, timestamp) {
  const landmarks = result.landmarks?.[0]
  if (!landmarks || landmarks.length < 33) return null

  const worldLandmarks = result.worldLandmarks?.[0] || []
  const normalizedLandmarks = landmarks.slice(0, 33).map((landmark) => ({
    x: landmark.x,
    y: landmark.y,
    z: landmark.z ?? 0,
    visibility: landmark.visibility ?? 1,
  }))

  return {
    timestamp,
    landmarks: normalizedLandmarks,
    worldLandmarks: normalizedLandmarks.map((_, index) => {
      const landmark = worldLandmarks[index]
      return {
        x: landmark?.x ?? 0,
        y: landmark?.y ?? 0,
        z: landmark?.z ?? 0,
        visibility: normalizedLandmarks[index].visibility,
      }
    }),
    visibility: normalizedLandmarks.map((landmark) => landmark.visibility ?? 0),
  }
}

function ensureVideoReady(video) {
  if (video.readyState >= 2 && video.videoWidth && video.videoHeight && Number.isFinite(video.duration)) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('视频首帧还没有加载完成，请稍后再试。'))
    }, 4000)

    const cleanup = () => {
      window.clearTimeout(timer)
      video.removeEventListener('loadeddata', handleReady)
      video.removeEventListener('canplay', handleReady)
      video.removeEventListener('error', handleError)
    }

    const handleReady = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error('视频读取失败，请重新选择视频。'))
    }

    video.addEventListener('loadeddata', handleReady)
    video.addEventListener('canplay', handleReady)
    video.addEventListener('error', handleError)
    video.load()
  })
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    const targetTime = Math.min(Math.max(time, 0), Math.max(0, (video.duration || time) - 0.02))

    if (Math.abs((video.currentTime || 0) - targetTime) < 0.015) {
      resolve()
      return
    }

    const timer = window.setTimeout(() => {
      video.removeEventListener('seeked', handleSeeked)
      resolve()
    }, 1200)

    const handleSeeked = () => {
      window.clearTimeout(timer)
      video.removeEventListener('seeked', handleSeeked)
      resolve()
    }

    video.addEventListener('seeked', handleSeeked)
    video.currentTime = targetTime
  })
}

export {
  runPoseComparison,
  extractPoseFrames,
  buildPoseFrame,
  ensureVideoReady,
  seekVideo,
}
