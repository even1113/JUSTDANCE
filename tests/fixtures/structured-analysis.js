function createStructuredAnalysisFixture(overrides = {}) {
  return {
    schemaVersion: '1.0',
    durationSec: 12,
    mirroredUserVideo: false,
    quality: {
      teacherFrameCount: 72,
      userFrameCount: 70,
      alignedPairCount: 68,
      teacherLostDurationSec: 0,
      userLostDurationSec: 0.2,
    },
    trackingGaps: [],
    issues: [
      {
        type: 'timing_delay',
        severity: 'high',
        bodyPart: 'left_wrist',
        bodyPartLabel: '左手臂',
        startTime: 5.2,
        endTime: 6.4,
        evidence: {
          delaySec: 0.28,
          confidence: 0.88,
        },
      },
    ],
    ...overrides,
  }
}

export { createStructuredAnalysisFixture }
