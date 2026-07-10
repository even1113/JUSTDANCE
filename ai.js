const AI_CONFIG = {
  endpoint: localStorage.getItem("dm_api_endpoint") || "https://generativelanguage.googleapis.com/v1beta",
  model: localStorage.getItem("dm_api_model") || "gemini-2.5-flash",
  apiKey: localStorage.getItem("dm_api_key") || "",
}

const FRAME_COUNT = 5
const MAX_IMAGE_SIZE = 512

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

export {
  AI_CONFIG,
  saveAiConfig,
  extractFrames,
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
