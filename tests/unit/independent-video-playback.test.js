import { describe, expect, test, vi } from 'vitest'
import { createIndependentVideoPlayback } from '../../hooks/useIndependentVideoPlayback.js'

function createVideo() {
  return {
    controls: true,
    currentTime: 0,
    defaultMuted: true,
    duration: 20,
    muted: true,
    paused: true,
    playbackRate: 1,
    playsInline: false,
    volume: 0,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    pause: vi.fn(),
  }
}

describe('independent video playback audio focus', () => {
  test('defaults to teacher audio and keeps only one audible track', () => {
    const teacher = createVideo()
    const user = createVideo()
    const onAudioChange = vi.fn()
    const playback = createIndependentVideoPlayback({
      teacherVideoRef: { current: teacher },
      userVideoRef: { current: user },
      onAudioChange,
    })

    playback.refresh()
    expect(teacher.muted).toBe(false)
    expect(user.muted).toBe(true)
    expect(teacher.volume).toBe(1)
    expect(user.volume).toBe(1)

    playback.toggleMuted('user')
    expect(teacher.muted).toBe(true)
    expect(user.muted).toBe(false)

    playback.setAlignment({ timeline: { duration: 10, teacherStart: 0 } })
    playback.seekCommon(4)
    playback.setPlaybackRate(1.25)
    expect(teacher.muted).toBe(true)
    expect(user.muted).toBe(false)
    expect(teacher.playbackRate).toBe(1.25)
    expect(user.playbackRate).toBe(1.25)
    expect(onAudioChange).toHaveBeenCalled()
  })
})
