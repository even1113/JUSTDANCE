const SYNC_TOLERANCE_SEC = 0.08
const DEFAULT_FPS = 30

function createVideoSync({
  teacherVideoRef,
  userVideoRef,
  frameSlider,
  frameTime,
  playButton,
  onStateChange = () => {},
}) {
  let isPlaying = false
  let rafId = null
  let cleanupFns = []

  function refresh() {
    cleanup()

    const teacher = teacherVideoRef.current
    const user = userVideoRef.current

    if (!teacher || !user) {
      setPlaying(false)
      updateSliderFromMaster()
      return
    }

    cleanupFns = [
      listen(teacher, 'timeupdate', updateSliderFromMaster),
      listen(teacher, 'seeked', () => syncUserToTeacher(true)),
      listen(teacher, 'ended', handleEnded),
      listen(user, 'ended', handleEnded),
      listen(teacher, 'loadedmetadata', updateSliderFromMaster),
      listen(user, 'loadedmetadata', updateSliderFromMaster),
    ]

    updateSliderFromMaster()
  }

  async function togglePlayPause() {
    if (isPlaying) {
      pauseBoth()
      return
    }

    await playBoth()
  }

  async function playBoth() {
    const teacher = teacherVideoRef.current
    const user = userVideoRef.current

    if (!teacher || !user) return

    if (teacher.ended || user.ended) {
      seekToTime(0)
    }

    syncUserToTeacher(true)
    setPlaying(true)
    startSyncLoop()

    try {
      await Promise.all([teacher.play(), user.play()])
    } catch {
      pauseBoth()
    }
  }

  function pauseBoth() {
    const teacher = teacherVideoRef.current
    const user = userVideoRef.current

    if (teacher) teacher.pause()
    if (user) user.pause()

    setPlaying(false)
    stopSyncLoop()
    updateSliderFromMaster()
  }

  function seekToRatio(ratio) {
    const duration = getMasterDuration()
    if (duration <= 0) return
    seekToTime(clamp(ratio, 0, 1) * duration)
  }

  function seekToTime(time) {
    const teacher = teacherVideoRef.current
    const user = userVideoRef.current
    const safeTime = clamp(time, 0, getMasterDuration())

    if (teacher) teacher.currentTime = safeTime
    if (user) user.currentTime = clamp(safeTime, 0, user.duration || safeTime)

    updateSliderFromMaster()
  }

  function stepFrame(delta, fps = DEFAULT_FPS) {
    const teacher = teacherVideoRef.current
    if (!teacher) return

    pauseBoth()
    seekToTime(teacher.currentTime + delta / fps)
  }

  function syncUserToTeacher(force = false) {
    const teacher = teacherVideoRef.current
    const user = userVideoRef.current

    if (!teacher || !user || !Number.isFinite(teacher.currentTime)) return

    const maxUserTime = user.duration || teacher.currentTime
    const target = clamp(teacher.currentTime, 0, maxUserTime)
    const drift = Math.abs((user.currentTime || 0) - target)

    if (force || drift > SYNC_TOLERANCE_SEC) {
      user.currentTime = target
    }
  }

  function startSyncLoop() {
    stopSyncLoop()

    const tick = () => {
      if (!isPlaying) return
      syncUserToTeacher(false)
      updateSliderFromMaster()
      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)
  }

  function stopSyncLoop() {
    if (rafId) {
      window.cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  function updateSliderFromMaster() {
    const teacher = teacherVideoRef.current
    const duration = getMasterDuration()

    if (!teacher || duration <= 0) {
      if (frameTime) frameTime.textContent = '0.00s'
      return
    }

    const currentTime = clamp(teacher.currentTime || 0, 0, duration)
    if (frameSlider) frameSlider.value = Math.round((currentTime / duration) * 1000)
    if (frameTime) frameTime.textContent = `${currentTime.toFixed(2)}s`
  }

  function getMasterDuration() {
    const teacher = teacherVideoRef.current
    const user = userVideoRef.current
    return teacher?.duration || user?.duration || 0
  }

  function handleEnded() {
    pauseBoth()
  }

  function setPlaying(nextValue) {
    isPlaying = nextValue
    if (playButton) playButton.textContent = isPlaying ? '❚❚' : '▶'
    onStateChange(isPlaying)
  }

  function cleanup() {
    cleanupFns.forEach((dispose) => dispose())
    cleanupFns = []
    stopSyncLoop()
  }

  return {
    refresh,
    togglePlayPause,
    playBoth,
    pauseBoth,
    seekToRatio,
    seekToTime,
    stepFrame,
    syncUserToTeacher,
    updateSliderFromMaster,
    getIsPlaying: () => isPlaying,
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

export {
  SYNC_TOLERANCE_SEC,
  createVideoSync,
}
