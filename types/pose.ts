export type PoseLandmark = {
  x: number
  y: number
  z?: number
  visibility?: number
}

export type PoseFrame = {
  timestamp: number
  landmarks: PoseLandmark[]
  worldLandmarks: PoseLandmark[]
  visibility: number[]
}

export type NormalizedPoseFrame = PoseFrame & {
  normalizedLandmarks: PoseLandmark[]
  angleFeatures: Record<string, number | null>
}

export type AlignedFramePair = {
  teacherIndex: number
  userIndex: number
  teacherTimestamp: number
  userTimestamp: number
  distance: number
}

export type StructuredIssue = {
  type: string
  bodyPart: string
  delayMs?: number
  ratio?: number
  severity?: "low" | "medium" | "high"
}

export type MovementAnalysis = {
  overallScore: number
  poseSimilarity: number
  timingScore: number
  amplitudeScore: number
  controlScore: number
  mirroredUserVideo: boolean
  alignedFramePairs: AlignedFramePair[]
  issues: StructuredIssue[]
}
