import { FilesetResolver, PoseLandmarker } from '../vendor/mediapipe/vision_bundle.mjs'

const MEDIAPIPE_VERSION = '0.10.35'
const VISION_WASM_BASE = new URL('../vendor/mediapipe/wasm', import.meta.url).href
const POSE_MODEL_URL = new URL('../vendor/mediapipe/pose_landmarker_lite.task', import.meta.url).href

let visionFilesetPromise = null

function getVisionFileset() {
  if (!visionFilesetPromise) {
    visionFilesetPromise = FilesetResolver.forVisionTasks(VISION_WASM_BASE)
  }

  return visionFilesetPromise
}

async function createPoseLandmarker(options = {}) {
  const vision = await getVisionFileset()
  const numPoses = Math.max(1, Math.min(6, Number(options.numPoses) || 4))
  const baseOptions = {
    modelAssetPath: options.modelAssetPath || POSE_MODEL_URL,
    delegate: options.delegate || 'GPU',
  }

  try {
    return await PoseLandmarker.createFromOptions(vision, {
      baseOptions,
      runningMode: 'VIDEO',
      numPoses,
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
      numPoses,
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
