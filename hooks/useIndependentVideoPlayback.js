const DEFAULT_FPS = 30

function createIndependentVideoPlayback({ teacherVideoRef, userVideoRef }) {
  let cleanupFns = []

  function refresh() {
    cleanup()

    const teacher = teacherVideoRef.current
    const user = userVideoRef.current
    if (!teacher || !user) return

    cleanupFns = [
      listen(teacher, 'play', () => pauseOtherVideo(teacher, user)),
      listen(user, 'play', () => pauseOtherVideo(user, teacher)),
    ]
  }

  function pauseOtherVideo(activeVideo, otherVideo) {
    if (!activeVideo.paused && !otherVideo.paused) otherVideo.pause()
  }

  function pauseAll() {
    teacherVideoRef.current?.pause()
    userVideoRef.current?.pause()
  }

  function stepFrame(kind, delta, fps = DEFAULT_FPS) {
    const video = kind === 'teacher' ? teacherVideoRef.current : userVideoRef.current
    if (!video) return

    video.pause()
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    video.currentTime = clamp(video.currentTime + delta / fps, 0, duration)
  }

  function seekAlignedPair(teacherTime, offsetSec = 0) {
    const teacher = teacherVideoRef.current
    const user = userVideoRef.current
    pauseAll()

    if (teacher) teacher.currentTime = clamp(teacherTime, 0, teacher.duration || teacherTime)
    if (user) user.currentTime = clamp(teacherTime + offsetSec, 0, user.duration || teacherTime)
  }

  function cleanup() {
    cleanupFns.forEach((dispose) => dispose())
    cleanupFns = []
  }

  return {
    refresh,
    pauseAll,
    stepFrame,
    seekAlignedPair,
    destroy: cleanup,
  }
}

function listen(target, eventName, handler) {
  target.addEventListener(eventName, handler)
  return () => target.removeEventListener(eventName, handler)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export { createIndependentVideoPlayback }
