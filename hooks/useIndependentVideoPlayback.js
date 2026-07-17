import {
  commonTimeToSourceTimes,
  localUserPlaybackRate,
  sourceTimesToCommonTime,
} from '../services/audioAlignment.js'

const DEFAULT_FPS = 30
const SOFT_SYNC_THRESHOLD_SEC = 0.035
const HARD_SYNC_THRESHOLD_SEC = 0.1
const MAX_RATE_CORRECTION = 0.015

function createIndependentVideoPlayback({
  teacherVideoRef,
  userVideoRef,
  onTimeUpdate = () => {},
  onPlaybackChange = () => {},
}) {
  let alignment = null
  let playbackRate = 1
  let isPlaying = false
  let loopEnabled = false
  let loopRange = null
  let frameRequestId = null
  let cleanupFns = []

  function refresh() {
    cleanupListeners()

    const teacher = teacherVideoRef.current
    const user = userVideoRef.current
    if (!teacher || !user) return

    teacher.controls = false
    user.controls = false
    user.muted = true
    teacher.playsInline = true
    user.playsInline = true

    cleanupFns = [
      listen(teacher, 'ended', pauseAll),
      listen(teacher, 'pause', handleTeacherPause),
      listen(teacher, 'seeked', () => publishTime()),
      listen(user, 'seeked', () => publishTime()),
    ]
    applyPlaybackRates()
    publishTime()
  }

  function setAlignment(nextAlignment) {
    alignment = nextAlignment
    const duration = getDuration()
    if (duration <= 0) {
      pauseAll()
      return
    }

    const current = clamp(getCommonTime(), 0, duration)
    seekCommon(current)
  }

  function getAlignment() {
    return alignment
  }

  function getDuration() {
    return Math.max(0, Number(alignment?.timeline?.duration) || 0)
  }

  function getCommonTime() {
    const teacher = teacherVideoRef.current
    if (!teacher || !alignment) return 0
    return sourceTimesToCommonTime(alignment, teacher.currentTime || 0)
  }

  function playPause() {
    if (isPlaying) {
      pauseAll()
      return Promise.resolve()
    }
    return play()
  }

  async function play() {
    const teacher = teacherVideoRef.current
    const user = userVideoRef.current
    if (!teacher || !user || !alignment || getDuration() <= 0) return

    const current = getCommonTime()
    if (current >= getDuration() - 0.04) seekCommon(0)

    syncUserToTeacher(true)
    applyPlaybackRates()
    isPlaying = true
    onPlaybackChange({ isPlaying, loopEnabled, playbackRate })
    startMonitor()

    const results = await Promise.allSettled([teacher.play(), user.play()])
    if (results.some((result) => result.status === 'rejected')) {
      pauseAll()
      throw new Error('浏览器阻止了视频播放，请再次点击播放按钮。')
    }
  }

  function handleTeacherPause() {
    if (!isPlaying) return
    pauseAll()
  }

  function pauseAll() {
    teacherVideoRef.current?.pause()
    userVideoRef.current?.pause()
    stopMonitor()
    if (isPlaying) {
      isPlaying = false
      onPlaybackChange({ isPlaying, loopEnabled, playbackRate })
    }
    publishTime()
  }

  function seekCommon(commonTime) {
    const teacher = teacherVideoRef.current
    const user = userVideoRef.current
    if (!teacher || !user || !alignment) return

    const wasPlaying = isPlaying
    const times = commonTimeToSourceTimes(alignment, commonTime)
    teacher.currentTime = clamp(times.teacherTime, 0, teacher.duration || times.teacherTime)
    user.currentTime = clamp(times.userTime, 0, user.duration || times.userTime)
    applyPlaybackRates()
    publishTime(times.commonTime)
    if (wasPlaying) startMonitor()
  }

  function stepFrame(delta, fps = DEFAULT_FPS) {
    pauseAll()
    seekCommon(getCommonTime() + delta / fps)
  }

  function setPlaybackRate(nextRate) {
    playbackRate = clamp(Number(nextRate) || 1, 0.25, 2)
    applyPlaybackRates()
    onPlaybackChange({ isPlaying, loopEnabled, playbackRate })
  }

  function setLoop(enabled, centerTime = getCommonTime(), durationSec = 4) {
    loopEnabled = Boolean(enabled)
    const duration = getDuration()
    const safeDuration = Math.min(duration, Math.max(1, durationSec))
    const start = clamp(centerTime - safeDuration / 2, 0, Math.max(0, duration - safeDuration))
    loopRange = loopEnabled
      ? { start, end: Math.min(duration, start + safeDuration) }
      : null
    onPlaybackChange({ isPlaying, loopEnabled, playbackRate, loopRange })
  }

  function syncUserToTeacher(force = false) {
    const teacher = teacherVideoRef.current
    const user = userVideoRef.current
    if (!teacher || !user || !alignment) return

    const expectedUserTime = commonTimeToSourceTimes(
      alignment,
      sourceTimesToCommonTime(alignment, teacher.currentTime || 0),
    ).userTime
    const error = expectedUserTime - (user.currentTime || 0)

    if (force || Math.abs(error) >= HARD_SYNC_THRESHOLD_SEC) {
      user.currentTime = clamp(expectedUserTime, 0, user.duration || expectedUserTime)
      applyPlaybackRates()
      return
    }

    const mappedRate = localUserPlaybackRate(alignment, teacher.currentTime || 0)
    const correction = Math.abs(error) >= SOFT_SYNC_THRESHOLD_SEC
      ? clamp(error * 0.12, -MAX_RATE_CORRECTION, MAX_RATE_CORRECTION)
      : 0
    user.playbackRate = clamp(
      playbackRate * mappedRate + correction,
      playbackRate * (1 - MAX_RATE_CORRECTION),
      playbackRate * (1 + MAX_RATE_CORRECTION),
    )
  }

  function applyPlaybackRates() {
    const teacher = teacherVideoRef.current
    const user = userVideoRef.current
    if (teacher) teacher.playbackRate = playbackRate
    if (user) {
      const mappedRate = alignment
        ? localUserPlaybackRate(alignment, teacher?.currentTime || 0)
        : 1
      user.playbackRate = clamp(
        playbackRate * mappedRate,
        playbackRate * (1 - MAX_RATE_CORRECTION),
        playbackRate * (1 + MAX_RATE_CORRECTION),
      )
    }
  }

  function startMonitor() {
    stopMonitor()

    const teacher = teacherVideoRef.current
    if (!teacher) return

    const update = () => {
      if (!isPlaying) return

      const commonTime = getCommonTime()
      if (loopEnabled && loopRange && commonTime >= loopRange.end) {
        seekCommon(loopRange.start)
      } else if (commonTime >= getDuration() - 0.015) {
        pauseAll()
        seekCommon(getDuration())
        return
      } else {
        syncUserToTeacher()
        publishTime(commonTime)
      }

      frameRequestId = requestNextFrame(teacher, update)
    }

    frameRequestId = requestNextFrame(teacher, update)
  }

  function stopMonitor() {
    const teacher = teacherVideoRef.current
    if (frameRequestId === null || !teacher) return

    if (teacher.cancelVideoFrameCallback && typeof frameRequestId === 'number') {
      teacher.cancelVideoFrameCallback(frameRequestId)
    } else {
      window.cancelAnimationFrame(frameRequestId)
    }
    frameRequestId = null
  }

  function publishTime(forcedTime = null) {
    const commonTime = forcedTime ?? getCommonTime()
    const teacher = teacherVideoRef.current
    const user = userVideoRef.current
    const times = alignment
      ? commonTimeToSourceTimes(alignment, commonTime)
      : { teacherTime: teacher?.currentTime || 0, userTime: user?.currentTime || 0 }

    onTimeUpdate({
      commonTime,
      duration: getDuration(),
      teacherTime: times.teacherTime,
      userTime: times.userTime,
      syncErrorSec: user ? (user.currentTime || 0) - times.userTime : 0,
    })
  }

  function cleanupListeners() {
    cleanupFns.forEach((dispose) => dispose())
    cleanupFns = []
  }

  function destroy() {
    pauseAll()
    cleanupListeners()
  }

  return {
    refresh,
    setAlignment,
    getAlignment,
    getDuration,
    getCommonTime,
    playPause,
    pauseAll,
    stepFrame,
    seekCommon,
    setPlaybackRate,
    setLoop,
    destroy,
  }
}

function requestNextFrame(video, callback) {
  if (video.requestVideoFrameCallback) {
    return video.requestVideoFrameCallback(callback)
  }
  return window.requestAnimationFrame(callback)
}

function listen(target, eventName, handler) {
  target.addEventListener(eventName, handler)
  return () => target.removeEventListener(eventName, handler)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export {
  HARD_SYNC_THRESHOLD_SEC,
  createIndependentVideoPlayback,
}
