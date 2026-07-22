import { describe, expect, test } from 'vitest'
import { getContainedContentRect, getPoseTrailFrames } from '../../components/PoseCanvas.js'

describe('pose canvas geometry', () => {
  test('keeps a portrait video centered inside a landscape canvas', () => {
    const rect = getContainedContentRect(600, 300, 300, 600)

    expect(rect.height).toBe(300)
    expect(rect.width).toBe(150)
    expect(rect.x).toBe(225)
  })

  test('keeps only recent real frames for wrist and ankle trails', () => {
    const frames = Array.from({ length: 40 }, (_, index) => ({
      timestamp: index / 10,
      landmarks: [],
    }))
    const trail = getPoseTrailFrames(frames, 3.9, { windowSec: 0.8, maxFrames: 6 })

    expect(trail).toHaveLength(6)
    expect(trail[0].timestamp).toBe(3.4)
    expect(trail.at(-1).timestamp).toBe(3.9)
  })
})
