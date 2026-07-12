const AI_CONFIG = {
  endpoint: localStorage.getItem("dm_api_endpoint") || "https://generativelanguage.googleapis.com/v1beta",
  model: localStorage.getItem("dm_api_model") || "gemini-2.5-flash",
  apiKey: localStorage.getItem("dm_api_key") || "",
}

const FRAME_COUNT = 5
const MAX_IMAGE_SIZE = 512
const MOTION_FRAME_COUNT = 28
const MOTION_CANVAS_WIDTH = 180
const MOTION_CANVAS_HEIGHT = 120

function saveAiConfig(config) {
  Object.assign(AI_CONFIG, config)
  localStorage.setItem("dm_api_endpoint", AI_CONFIG.endpoint)
  localStorage.setItem("dm_api_model", AI_CONFIG.model)
  localStorage.setItem("dm_api_key", AI_CONFIG.apiKey)
}

function extractFrames(videoEl) {
  return new Promise((resolve) => {
    const frames = []
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const duration = videoEl.duration

    if (!duration || duration <= 0) {
      resolve([])
      return
    }

    const step = duration / (FRAME_COUNT + 1)
    let current = 1

    function capture() {
      if (current > FRAME_COUNT) {
        resolve(frames)
        return
      }

      videoEl.currentTime = step * current

      videoEl.addEventListener("seeked", function onSeeked() {
        videoEl.removeEventListener("seeked", onSeeked)

        let w = videoEl.videoWidth
        let h = videoEl.videoHeight
        const scale = Math.min(MAX_IMAGE_SIZE / w, MAX_IMAGE_SIZE / h, 1)
        w = Math.round(w * scale)
        h = Math.round(h * scale)

        canvas.width = w
        canvas.height = h
        ctx.drawImage(videoEl, 0, 0, w, h)

        frames.push({
          time: videoEl.currentTime,
          base64: canvas.toDataURL("image/jpeg", 0.7).split(",")[1],
        })

        current++
        capture()
      })
    }

    capture()
  })
}

function buildPrompt(cropInfo) {
  const cropNote = cropInfo
    ? `用户在练习视频中框选了自己的区域：x=${cropInfo.x}, y=${cropInfo.y}, width=${cropInfo.width}, height=${cropInfo.height}。请重点关注框选区域内的人物。`
    : ""

  return `你是一位温和、专业的舞蹈复盘教练。你的任务是对比老师视频和用户练习视频的关键帧，找出动作路径差异，给出具体可执行的训练建议。

## 评价维度
- 节奏：是否卡准重拍，是否有提前或滞后
- 身体控制：重心是否稳定，发力顺序是否连贯，身体分离是否清晰
- 动作线条：手臂/腿部/躯干是否到位，角度是否清楚
- 出片表现：镜头距离、光线、构图、表情眼神

## 输出要求
请严格按以下 JSON 格式输出，不要输出任何其他内容：

{
  "title": "一句话总结最主要的差异",
  "aiSummary": "2-3句话的整体比对总结",
  "mismatches": [
    {
      "timestamp": "MM:SS",
      "title": "这个差异的简短描述",
      "teacherPath": "老师在这个时间点的动作描述（绿色标准路径）",
      "userPath": "用户在这个时间点的动作描述（红色偏差路径）",
      "advice": "针对这个差异的具体练习建议"
    }
  ],
  "drillPlan": {
    "durationMin": 15,
    "steps": ["步骤1", "步骤2", "步骤3"]
  },
  "reviewAdvice": ["建议1", "建议2", "建议3"],
  "safetyNote": "以上建议仅用于舞蹈训练参考，如出现疼痛或不适请停止练习。"
}

## 约束
- 必须给出具体时间点
- 每个差异必须区分老师动作和用户动作
- 建议必须具体可执行，不要泛泛而谈
- 语气鼓励但不敷衍
- 禁止：只输出分数、医疗诊断语言、身材攻击、性化评价
- mismatches 至少 2 条，最多 5 条
${cropNote}

下面是关键帧图片，每组包含同一时间点的老师帧和用户帧：`
}

async function callGeminiApi(prompt, frames) {
  const parts = [{ text: prompt }]

  for (let i = 0; i < frames.teacherFrames.length; i++) {
    const tf = frames.teacherFrames[i]
    const uf = frames.userFrames[i]
    if (!tf || !uf) continue

    const ts = formatTimestampApi(tf.time)
    parts.push({ text: `\n--- 时间点 ${ts} ---` })
    parts.push({ text: "老师帧：" })
    parts.push({
      inline_data: {
        mime_type: "image/jpeg",
        data: tf.base64,
      },
    })
    parts.push({ text: "用户帧：" })
    parts.push({
      inline_data: {
        mime_type: "image/jpeg",
        data: uf.base64,
      },
    })
  }

  const url = `${AI_CONFIG.endpoint}/models/${AI_CONFIG.model}:generateContent?key=${AI_CONFIG.apiKey}`

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API 请求失败 (${response.status}): ${err}`)
  }

  const data = await response.json()

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    throw new Error("API 返回内容为空")
  }

  return parseAiResponse(text)
}

function formatTimestampApi(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function parseAiResponse(text) {
  let jsonStr = text.trim()

  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  }

  if (!jsonStr.startsWith("{")) {
    const braceStart = jsonStr.indexOf("{")
    if (braceStart >= 0) {
      jsonStr = jsonStr.slice(braceStart)
    }
  }

  const report = JSON.parse(jsonStr)

  report.id = `ai_${Date.now()}`
  report.createdAt = new Date().toISOString()

  return report
}

async function analyzeWithAi(referenceVideo, practiceVideo, cropInfo) {
  if (!AI_CONFIG.apiKey) {
    throw new Error("请先设置 API Key（点击右上角设置图标）")
  }

  const [teacherFrames, userFrames] = await Promise.all([
    extractFrames(referenceVideo),
    extractFrames(practiceVideo),
  ])

  if (teacherFrames.length === 0 || userFrames.length === 0) {
    throw new Error("视频抽帧失败，请确认视频可以正常播放")
  }

  const minLen = Math.min(teacherFrames.length, userFrames.length)
  const frames = {
    teacherFrames: teacherFrames.slice(0, minLen),
    userFrames: userFrames.slice(0, minLen),
  }

  const prompt = buildPrompt(cropInfo)
  return callGeminiApi(prompt, frames)
}

async function analyzeMotionComparison(referenceVideo, practiceVideo, cropInfo, onProgress = () => {}) {
  if (!referenceVideo || !practiceVideo) {
    throw new Error("请先添加老师视频和我的视频")
  }

  const duration = Math.min(referenceVideo.duration || 0, practiceVideo.duration || 0)
  if (!duration || duration <= 0) {
    throw new Error("视频时长读取失败，请确认两段视频可以正常播放")
  }

  onProgress("正在从两段视频抽取关键帧...")
  const sampleTimes = buildSampleTimes(duration, MOTION_FRAME_COUNT)

  onProgress("正在计算老师动作路径...")
  const teacherTrack = await buildMotionTrack(referenceVideo, sampleTimes)

  onProgress("正在计算我的动作路径...")
  const userTrack = await buildMotionTrack(practiceVideo, sampleTimes, cropInfo)

  onProgress("正在匹配红绿路径差异...")
  const compared = compareMotionTracks(teacherTrack, userTrack, duration)

  return buildMotionReport(compared, cropInfo)
}

function buildSampleTimes(duration, count) {
  const safeCount = Math.max(6, count)
  const start = Math.min(0.25, duration * 0.08)
  const end = Math.max(start, duration - Math.min(0.25, duration * 0.08))
  const span = Math.max(0.01, end - start)

  return Array.from({ length: safeCount }, (_, i) => start + (span * i) / (safeCount - 1))
}

async function buildMotionTrack(video, times, cropInfo) {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  canvas.width = MOTION_CANVAS_WIDTH
  canvas.height = MOTION_CANVAS_HEIGHT

  const frames = []
  let previous = null

  for (const time of times) {
    await seekVideo(video, time)
    const frame = captureMotionFrame(ctx, canvas, video, cropInfo)
    const point = detectMotionPoint(frame, previous)
    frames.push({
      time,
      point,
      confidence: point.confidence,
      box: point.box,
    })
    previous = frame
  }

  return smoothTrack(frames)
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    const targetTime = Math.min(Math.max(time, 0), Math.max(0, (video.duration || time) - 0.04))

    if (Math.abs(video.currentTime - targetTime) < 0.025) {
      resolve()
      return
    }

    const timer = window.setTimeout(() => {
      video.removeEventListener("seeked", onSeeked)
      resolve()
    }, 900)

    function onSeeked() {
      window.clearTimeout(timer)
      video.removeEventListener("seeked", onSeeked)
      resolve()
    }

    video.addEventListener("seeked", onSeeked, { once: true })
    video.currentTime = targetTime
  })
}

function captureMotionFrame(ctx, canvas, video, cropInfo) {
  const videoWidth = video.videoWidth || canvas.width
  const videoHeight = video.videoHeight || canvas.height
  const crop = normalizeCrop(cropInfo, videoWidth, videoHeight)

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(
    video,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )

  return {
    data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    width: canvas.width,
    height: canvas.height,
    crop,
    videoWidth,
    videoHeight,
  }
}

function normalizeCrop(cropInfo, videoWidth, videoHeight) {
  if (!cropInfo) {
    return {
      x: 0,
      y: 0,
      width: videoWidth,
      height: videoHeight,
    }
  }

  const x = clamp(cropInfo.x, 0, videoWidth - 1)
  const y = clamp(cropInfo.y, 0, videoHeight - 1)
  const width = clamp(cropInfo.width, 1, videoWidth - x)
  const height = clamp(cropInfo.height, 1, videoHeight - y)

  return { x, y, width, height }
}

function detectMotionPoint(frame, previous) {
  const { data, width, height } = frame
  let total = 0
  let weightedX = 0
  let weightedY = 0
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const saturation = Math.max(r, g, b) - Math.min(r, g, b)
      const contrast = localContrast(data, width, x, y, luma)
      let score = saturation * 0.35 + contrast * 0.65

      if (previous) {
        const pr = previous.data[idx]
        const pg = previous.data[idx + 1]
        const pb = previous.data[idx + 2]
        const prevLuma = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb
        score += Math.abs(luma - prevLuma) * 1.25
      }

      if (score < 18) continue

      total += score
      weightedX += x * score
      weightedY += y * score
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (total <= 0) {
    return {
      x: 50,
      y: 55,
      confidence: 0,
      box: { x: 35, y: 25, width: 30, height: 55 },
    }
  }

  const rawX = weightedX / total
  const rawY = weightedY / total
  const point = canvasPointToVideoPercent(frame, rawX, rawY)
  const boxStart = canvasPointToVideoPercent(frame, minX, minY)
  const boxEnd = canvasPointToVideoPercent(frame, maxX, maxY)

  return {
    x: point.x,
    y: point.y,
    confidence: clamp(total / (width * height * 28), 0, 1),
    box: {
      x: boxStart.x,
      y: boxStart.y,
      width: Math.max(1, boxEnd.x - boxStart.x),
      height: Math.max(1, boxEnd.y - boxStart.y),
    },
  }
}

function localContrast(data, width, x, y, luma) {
  const left = (y * width + x - 1) * 4
  const right = (y * width + x + 1) * 4
  const up = ((y - 1) * width + x) * 4
  const down = ((y + 1) * width + x) * 4
  const neighborLuma = [
    0.2126 * data[left] + 0.7152 * data[left + 1] + 0.0722 * data[left + 2],
    0.2126 * data[right] + 0.7152 * data[right + 1] + 0.0722 * data[right + 2],
    0.2126 * data[up] + 0.7152 * data[up + 1] + 0.0722 * data[up + 2],
    0.2126 * data[down] + 0.7152 * data[down + 1] + 0.0722 * data[down + 2],
  ]
  return neighborLuma.reduce((sum, item) => sum + Math.abs(luma - item), 0) / neighborLuma.length
}

function canvasPointToVideoPercent(frame, canvasX, canvasY) {
  const videoX = frame.crop.x + (canvasX / frame.width) * frame.crop.width
  const videoY = frame.crop.y + (canvasY / frame.height) * frame.crop.height

  return {
    x: clamp((videoX / frame.videoWidth) * 100, 0, 100),
    y: clamp((videoY / frame.videoHeight) * 100, 0, 100),
  }
}

function smoothTrack(frames) {
  return frames.map((frame, index) => {
    const prev = frames[index - 1]?.point
    const next = frames[index + 1]?.point
    if (!prev || !next) return frame

    return {
      ...frame,
      point: {
        ...frame.point,
        x: (prev.x + frame.point.x * 2 + next.x) / 4,
        y: (prev.y + frame.point.y * 2 + next.y) / 4,
      },
    }
  })
}

function compareMotionTracks(teacherTrack, userTrack, duration) {
  const count = Math.min(teacherTrack.length, userTrack.length)
  const distances = []

  for (let i = 0; i < count; i++) {
    const teacher = teacherTrack[i].point
    const user = userTrack[i].point
    const dx = user.x - teacher.x
    const dy = user.y - teacher.y
    const distance = Math.hypot(dx, dy)
    distances.push({
      index: i,
      time: teacherTrack[i].time,
      teacher,
      user,
      dx,
      dy,
      distance,
      teacherConfidence: teacherTrack[i].confidence,
      userConfidence: userTrack[i].confidence,
    })
  }

  const peaks = pickDistancePeaks(distances, 3)
  const averageDistance = distances.reduce((sum, item) => sum + item.distance, 0) / Math.max(1, distances.length)
  const maxDistance = Math.max(...distances.map((item) => item.distance), 0)

  return {
    duration,
    teacherTrack,
    userTrack,
    distances,
    peaks,
    averageDistance,
    maxDistance,
    pathMatchScore: Math.round(clamp(100 - averageDistance * 3.2, 0, 100)),
    timingScore: estimateTimingScore(teacherTrack, userTrack),
  }
}

function pickDistancePeaks(distances, count) {
  const sorted = [...distances].sort((a, b) => b.distance - a.distance)
  const selected = []
  const minGap = Math.max(2, Math.floor(distances.length / 6))

  for (const item of sorted) {
    if (selected.some((peak) => Math.abs(peak.index - item.index) < minGap)) continue
    selected.push(item)
    if (selected.length >= count) break
  }

  return selected.sort((a, b) => a.index - b.index)
}

function estimateTimingScore(teacherTrack, userTrack) {
  const teacherMovement = movementEnergy(teacherTrack)
  const userMovement = movementEnergy(userTrack)
  let bestLag = 0
  let bestScore = -Infinity

  for (let lag = -3; lag <= 3; lag++) {
    let score = 0
    let samples = 0

    for (let i = 0; i < teacherMovement.length; i++) {
      const j = i + lag
      if (j < 0 || j >= userMovement.length) continue
      score -= Math.abs(teacherMovement[i] - userMovement[j])
      samples++
    }

    if (samples > 0 && score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }

  return Math.round(clamp(92 - Math.abs(bestLag) * 9, 45, 100))
}

function movementEnergy(track) {
  const result = []
  for (let i = 1; i < track.length; i++) {
    const prev = track[i - 1].point
    const current = track[i].point
    result.push(Math.hypot(current.x - prev.x, current.y - prev.y))
  }
  return result
}

function buildMotionReport(comparison, cropInfo) {
  const mismatches = comparison.peaks.map((peak) => buildMotionMismatch(peak))
  const fallbackIndex = Math.floor(comparison.distances.length / 2)
  const safeMismatches = mismatches.length > 0
    ? mismatches
    : [buildMotionMismatch(comparison.distances[fallbackIndex])]
  const main = safeMismatches[0]
  const pathDescriptor = comparison.averageDistance > 16 ? "偏离明显" : comparison.averageDistance > 9 ? "局部偏离" : "整体接近"

  const report = {
    id: `motion_${Date.now()}`,
    createdAt: new Date().toISOString(),
    title: `${main.title}，整体路径${pathDescriptor}`,
    aiSummary: `这次比对已经基于两段视频的真实帧计算动作路径。老师的绿色路径和你的红色路径平均相差 ${comparison.averageDistance.toFixed(1)} 个画面百分点，最大偏差出现在 ${formatTimestampApi(main.rawTime)} 附近。建议先不要练整段，优先暂停在红线偏离最大的帧，把身体路径贴近绿色标准线。`,
    mismatches: safeMismatches.map(({ rawTime, ...item }) => item),
    drillPlan: {
      durationMin: 15,
      steps: buildMotionDrills(safeMismatches),
    },
    reviewAdvice: [
      "先拖动时间轴到红线偏离最大的帧，确认偏离发生在上半身、腰胯还是脚下。",
      "每次只修一个路径问题：让红线贴近绿线后，再恢复到正常速度。",
      cropInfo
        ? "你已经框选了自己；下一次保持同样机位，便于比较进步。"
        : "如果视频里有多人或背景复杂，先用「框选自己」提高路径检测稳定性。",
    ],
    scores: {
      pathMatch: comparison.pathMatchScore,
      timing: comparison.timingScore,
      maxDeviation: Math.round(comparison.maxDistance),
    },
    overlay: {
      teacherPoints: comparison.teacherTrack.map((item) => item.point),
      userPoints: comparison.userTrack.map((item) => item.point),
      peakIndices: comparison.peaks.map((item) => item.index),
    },
    safetyNote: "以上建议仅用于舞蹈训练参考，如出现疼痛或不适请停止练习。",
  }

  if (cropInfo) report.userCropRegion = cropInfo

  return report
}

function buildMotionMismatch(peak) {
  const horizontal = Math.abs(peak.dx)
  const vertical = Math.abs(peak.dy)
  const direction = horizontal > vertical
    ? (peak.dx > 0 ? "向右偏" : "向左偏")
    : (peak.dy > 0 ? "偏低" : "偏高")
  const part = vertical > horizontal * 1.25 ? "重心高度" : horizontal > vertical * 1.25 ? "左右路径" : "身体路径"
  const title = `${part}${direction} ${peak.distance.toFixed(1)}%`

  return {
    rawTime: peak.time,
    timestamp: formatTimestampApi(peak.time),
    title,
    teacherPath: `绿色路径位于画面 x=${peak.teacher.x.toFixed(0)}%、y=${peak.teacher.y.toFixed(0)}%，代表老师在这一帧的动作中心。`,
    userPath: `红色路径位于画面 x=${peak.user.x.toFixed(0)}%、y=${peak.user.y.toFixed(0)}%，相对老师${direction}，偏差约 ${peak.distance.toFixed(1)}%。`,
    advice: buildMotionAdvice(part, direction),
  }
}

function buildMotionAdvice(part, direction) {
  if (part === "重心高度") {
    return direction === "偏低"
      ? "暂停在这一帧，先把膝盖和髋部高度抬回老师的绿线位置，再继续动作。"
      : "暂停在这一帧，增加膝盖缓冲和身体下沉，让重心更贴近老师的低位路径。"
  }

  if (part === "左右路径") {
    return direction.includes("右")
      ? "单独练这一拍的重心回收，避免身体过度甩到右侧。"
      : "单独练这一拍的侧向打开，确认肩、胯和脚下方向一起到位。"
  }

  return "把这一帧放慢到 0.5 倍速，先对齐躯干路径，再叠加手臂和表情。"
}

function buildMotionDrills(mismatches) {
  const primary = mismatches[0]?.title || "路径偏差"
  return [
    `3 分钟：暂停在 ${mismatches[0]?.timestamp || "关键帧"}，只观察「${primary}」这一处红绿线差异。`,
    "6 分钟：0.5 倍速重复同一小节，让红线逐步贴近绿色标准路径。",
    "6 分钟：恢复 0.75 倍速录一遍，再用同样时间点重新比对。",
  ]
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export {
  AI_CONFIG,
  saveAiConfig,
  extractFrames,
  analyzeMotionComparison,
  analyzeWithAi,
  buildReport as buildMockReport,
}

function buildReport(duration, cropInfo) {
  const selectedMismatches = pickRandom(mismatchPool, 3)
  const mismatches = selectedMismatches.map((item, i) => {
    const ratio = (i + 1) / 4
    const ts = Math.max(1, Math.floor(duration * ratio))
    const titleIndex = Math.floor(Math.random() * item.titles.length)
    return {
      timestamp: formatTimestampApi(ts),
      title: item.titles[titleIndex],
      teacherPath: item.teacher,
      userPath: item.user,
      advice: item.advice,
    }
  })

  const mainTitle = mismatches[0].title
  const steps = pickRandom(drillStepPool, 3)
  const durationMin = steps.reduce((sum, s) => sum + parseInt(s, 10), 0)
  const reviewAdvice = pickRandom(reviewAdvicePool, 3)
  const aiSummary = summaryTemplates[Math.floor(Math.random() * summaryTemplates.length)]

  const report = {
    id: `mock_${Date.now()}`,
    createdAt: new Date().toISOString(),
    title: mainTitle,
    aiSummary,
    mismatches,
    drillPlan: { durationMin, steps },
    reviewAdvice,
    safetyNote: "以上建议仅用于舞蹈训练参考，如出现疼痛或不适请停止练习。",
  }

  if (cropInfo) {
    report.userCropRegion = cropInfo
  }

  return report
}

const mismatchPool = [
  {
    titles: ["Wave 路径在腰胯处中断", "手臂延伸不到位", "肩胸分离不够清晰"],
    teacher: "绿色路径从肩膀传到胸、腰、胯，形成连续曲线。",
    user: "红色路径在胸口后变短，腰胯没有继续向下传递。",
    advice: "暂停在这一帧，慢速练 4 组肩-胸-腰-胯，每组 8 拍。",
  },
  {
    titles: ["重心比老师慢半拍", "脚下重心切换滞后", "重心转移不够果断"],
    teacher: "老师手臂打开时，重心已经压到右脚。",
    user: "你的手先到位，脚下重心停在中间，下一帧才补过去。",
    advice: "拆掉手臂，只练脚下重心切换 5 组，再叠加手臂动作。",
  },
  {
    titles: ["Ending 定格提前松掉", "最后定格不够干净", "收尾动作提前回弹"],
    teacher: "老师最后一拍身体和眼神都停住，路径收得很干净。",
    user: "你的上半身路径提前回弹，定格的线条比老师短。",
    advice: "最后 4 拍单独练 5 次，动作停住 2 秒再放松。",
  },
  {
    titles: ["节奏卡点偏早", "动作比音乐快半拍", "抢拍导致路径变形"],
    teacher: "老师每个重拍都精准卡在鼓点上，路径节奏稳定。",
    user: "你的动作提前启动，红线在重拍前就已经到达终点。",
    advice: "先不跟音乐，用节拍器从 0.5 倍速开始练卡点。",
  },
  {
    titles: ["身体线条角度偏小", "手臂打开幅度不够", "动作路径比老师短"],
    teacher: "老师手臂完全展开，绿色路径从肩到手尖是一条长弧线。",
    user: "你的手臂弯曲，红色路径在手肘处就折回来了。",
    advice: "对镜练手臂全展开 10 次，确认肘关节完全伸直。",
  },
  {
    titles: ["躯干发力顺序反了", "核心带动不够", "发力从末端开始而不是躯干"],
    teacher: "老师从核心发力，路径从腰传到肩再到手。",
    user: "你从手臂开始发力，红色路径从手往回传，方向和老师相反。",
    advice: "躺地练核心发力 3 组，感受从腰腹带动四肢的顺序。",
  },
  {
    titles: ["头部和视线方向偏移", "眼神没有跟随动作", "头部路径和身体路径脱节"],
    teacher: "老师头部和身体路径同步转动，视线始终朝向动作方向。",
    user: "你的头部路径独立于身体，视线还停留在上一个方向。",
    advice: "单独练头部跟随 8 次，先慢速确认视线和手同步。",
  },
  {
    titles: ["膝盖弯曲角度不一致", "下半身路径偏低", "蹲的深度和老师不同"],
    teacher: "老师膝盖弯曲约 90 度，绿色路径在低位保持稳定。",
    user: "你的膝盖弯曲不够，红色路径比绿线高出一截。",
    advice: "靠墙蹲 30 秒 × 3 组，找到和老师一样的膝盖角度。",
  },
]

const summaryTemplates = [
  "这次比对里，你的上半身节奏基本跟上了老师，但身体路径没有完整传递到腰胯。下一次先不用练整段，建议只抓差异最大的几秒，把路径逐段对齐。",
  "整体来看，你的动作幅度和老师比较接近，但发力顺序和节奏有几处明显偏差。建议先修路径方向，再修卡点时机。",
  "你的动作框架和老师差不多，但细节路径有几处偏移——特别是重心和手臂延伸。建议每次只修一个问题，不要贪多。",
  "这次比对发现你的节奏感不错，但身体路径的完整度需要加强。几处红线比绿线短，说明动作没有做到位就收回来了。",
  "比对结果显示你的动作方向基本正确，但路径的精准度还不够。有几帧红线偏离绿线较远，建议慢速拆解这几个片段。",
]

const drillStepPool = [
  "3 分钟：只看肩胸分离，确认红线能贴近绿色上半身路径。",
  "3 分钟：对镜练手臂全展开，确认肘关节完全伸直。",
  "3 分钟：靠墙蹲，找到和老师一样的膝盖角度。",
  "3 分钟：躺地练核心发力，感受从腰腹带动四肢的顺序。",
  "3 分钟：单独练头部跟随，确认视线和手同步。",
  "6 分钟：慢速 Wave，把路径从肩膀传到腰胯。",
  "6 分钟：0.5 倍速练重心切换，先走脚下再叠加手臂。",
  "6 分钟：0.75 倍速音乐练差异最大的片段，重点看路径贴合。",
  "6 分钟：对镜练定格，每个停顿保持 2 秒。",
  "6 分钟：节拍器卡点练习，从慢速开始逐步加速。",
]

const reviewAdvicePool = [
  "先拖动时间轴到红线偏离最大的帧，不要一上来练整段。",
  "每次只修一个路径问题，修好再换下一个。",
  "下一次录制尽量固定机位，让膝盖和脚踝都进入画面，AI 更容易判断路径。",
  "如果视频里有多人，记得用「框选自己」功能标出你的位置。",
  "录视频时穿贴身衣服，宽松衣物会遮挡身体路径，影响 AI 判断。",
  "尽量在光线均匀的环境录制，逆光或侧光会让路径识别不准确。",
]

function pickRandom(arr, count) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}
