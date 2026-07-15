import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

const MEDIAPIPE_VERSION = '0.10.35'
const VISION_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const POSE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

let visionFilesetPromise = null

function getVisionFileset() {
  if (!visionFilesetPromise) {
    visionFilesetPromise = FilesetResolver.forVisionTasks(VISION_WASM_BASE)
  }

  return visionFilesetPromise
}

async function createPoseLandmarker(options = {}) {
  const vision = await getVisionFileset()
  const baseOptions = {
    modelAssetPath: options.modelAssetPath || POSE_MODEL_URL,
    delegate: options.delegate || 'GPU',
  }

  try {
    return await PoseLandmarker.createFromOptions(vision, {
      baseOptions,
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
  } catch (error) {
    if (baseOptions.delegate !== 'GPU') throw error

    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: baseOptions.modelAssetPath,
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
  }
}

function resetPoseLandmarkerCache() {
  visionFilesetPromise = null
}

export {
  MEDIAPIPE_VERSION,
  POSE_MODEL_URL,
  VISION_WASM_BASE,
  createPoseLandmarker,
  resetPoseLandmarkerCache,
}
