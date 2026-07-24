import {
  MAX_VIDEO_BYTES,
  canStartAnalysis,
  canStartProcessing,
  createInitialAppState,
  getActiveMismatchIndex,
  toggleExpandedMismatchId,
  validateVideoDuration,
  validateVideoFile,
} from '../../services/appState.js'

describe('app state and upload validation', () => {
  test('accepts MP4 and MOV within the MVP size limit', () => {
    expect(validateVideoFile({ name: 'practice.mp4', type: 'video/mp4', size: 12 })).toEqual({ valid: true, message: '' })
    expect(validateVideoFile({ name: 'teacher.MOV', type: '', size: MAX_VIDEO_BYTES })).toEqual({ valid: true, message: '' })
  })

  test('rejects unsupported formats, oversized files, and long videos', () => {
    expect(validateVideoFile({ name: 'practice.webm', type: 'video/webm', size: 12 }).valid).toBe(false)
    expect(validateVideoFile({ name: 'practice.mp4', type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 }).valid).toBe(false)
    expect(validateVideoDuration(181).valid).toBe(false)
    expect(validateVideoDuration(180).valid).toBe(true)
  })

  test('requires two videos, two subjects, and a ready alignment before analysis', () => {
    const state = createInitialAppState()
    expect(canStartAnalysis(state)).toBe(false)
    state.videos.teacher = { name: 'teacher.mp4' }
    state.videos.user = { name: 'user.mp4' }
    state.subjectSelections = { teacher: 'person-1', user: 'person-2' }
    state.alignment = { status: 'ready' }
    expect(canStartAnalysis(state)).toBe(true)
  })

  test('blocks processing when either browser preview cannot be decoded', () => {
    const state = createInitialAppState()
    state.videos.teacher = { name: 'teacher.mp4' }
    state.videos.user = { name: 'user.mov', playbackError: true }
    expect(canStartProcessing(state)).toBe(false)
  })

  test('activates only the mismatch interval under the shared playhead', () => {
    const issues = [
      { startTime: 8, endTime: 11 },
      { startTime: 18, endTime: 20 },
    ]
    expect(getActiveMismatchIndex(issues, 9)).toBe(0)
    expect(getActiveMismatchIndex(issues, 17)).toBe(-1)
    expect(getActiveMismatchIndex(issues, 20)).toBe(1)
  })

  test('toggles mismatch expansion independently', () => {
    const firstOpen = toggleExpandedMismatchId([], 'issue-1')
    const firstAndSecondOpen = toggleExpandedMismatchId(firstOpen, 'issue-2')
    const onlySecondOpen = toggleExpandedMismatchId(firstAndSecondOpen, 'issue-1')

    expect(firstOpen).toEqual(['issue-1'])
    expect(firstAndSecondOpen).toEqual(['issue-1', 'issue-2'])
    expect(onlySecondOpen).toEqual(['issue-2'])
  })
})
