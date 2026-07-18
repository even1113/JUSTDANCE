<!-- version: v0.7 | updated: 2026-07-18 -->
# DanceMirror AI Spec

## Changelog

- v0.7 (2026-07-18)：输入改为服务端实际接收的结构化动作分析；明确 DeepSeek v4 Flash/Pro 和规则报告降级边界
- v0.6 (2026-07-18)：增加 `schemaVersion` 与报告 `id`，所有 provider 输出必须经过 Report v1 运行时校验
- v0.5 (2026-07-17)：老师视频改为必需；差异限定 1–3 条并按优先级排序；增加严重程度、判断依据和分析质量字段；明确不输出评分
- v0.4 (2026-07-17)：建议改为公共时间轴区间数据，加入“肯定—问题—影响—练法—鼓励”教练表达；禁止向用户展示毫秒、百分比和坐标
- v0.3 (2026-07-15)：结构化姿态分析只向模型提供指标与问题，不发送原始视频

## 1. AI 角色

AI 是一位温和、具体、会给训练建议的舞蹈复盘教练。

核心任务不是打分，而是解释双视频里的动作和节奏差异：

> 老师和用户在姿态角度、动作幅度、节奏和控制上有什么差异，为什么看起来不一样，下一次应该怎么练。

## 2. 输入

模型输入不是原始视频、签名 URL、抽帧或关键点，而是经过运行时校验的结构化动作分析：

```json
{
  "schemaVersion": "1.0",
  "durationSec": 42,
  "mirroredUserVideo": false,
  "quality": {
    "teacherFrameCount": 252,
    "userFrameCount": 248,
    "alignedPairCount": 236,
    "teacherLostDurationSec": 0,
    "userLostDurationSec": 0.4
  },
  "trackingGaps": [],
  "issues": [
    {
      "type": "timing_delay",
      "severity": "high",
      "bodyPart": "left_wrist",
      "bodyPartLabel": "左手臂",
      "startTime": 8,
      "endTime": 10,
      "evidence": {
        "timingOffsetSec": 0.28
      }
    }
  ]
}
```

输入对象及任意嵌套层级禁止包含 `video`、`videoUrl`、`frames`、`landmarks`、`worldLandmarks` 或 `keypoints`。

## 3. 输出 schema

```json
{
  "schemaVersion": "1.0",
  "id": "report_01J...",
  "title": "Wave 和重心路径没有完全贴合老师",
  "aiSummary": "这次比对里，用户上半身节奏基本跟上老师，但身体路径没有完整传递到腰胯...",
  "mismatches": [
    {
      "timestamp": "00:08",
      "startTime": 8.0,
      "endTime": 10.0,
      "title": "Wave 路径在腰胯处中断",
      "positive": "你的肩胸方向已经做得很清楚，动作也敢于延伸。",
      "performance": "这一段力量传到胸口后稍微断了一下，腰胯没有继续接住。",
      "impact": "身体的连贯感会变弱，rolling 看起来像分成了两段。",
      "practice": "先用 0.75 倍速练肩—胸—腰—胯，每个位置停一拍，再把四个位置连起来。",
      "encouragement": "你的上半段路线已经正确，把力量继续送下去就会更流畅。",
      "priority": 1,
      "severity": "high",
      "evidenceSummary": "老师在这一段的躯干动作连续下移，用户动作在胸口附近出现明显停顿。",
      "quality": "trusted"
    }
  ],
  "drillPlan": {
    "durationMin": 15,
    "steps": [
      "3 分钟肩胸分离",
      "6 分钟慢速 Wave",
      "6 分钟跟 0.75 倍速音乐串 8 秒到 14 秒"
    ]
  },
  "reviewAdvice": [
    "先回看姿态差异最大的时间点，不要一上来练整段。",
    "每次只修一个路径问题。",
    "下一次录制尽量固定机位。"
  ],
  "safetyNote": "以上建议仅用于舞蹈训练参考，如出现疼痛或不适请停止练习。"
}
```

约束：

- `mismatches` 必须为 1–3 条，按 `priority` 从 1 开始升序排列
- `severity` 仅用于差异节点的 high / medium / low 视觉，不等同于用户能力评分
- `quality` 为 `trusted` 时正常展示，为 `reference-only` 时展示“仅供参考”；置信度过低的片段不得生成具体动作结论
- `evidenceSummary` 属于 AI 推理依据，默认隐藏、按需展开
- 输出禁止包含综合分、四维分、排名、满分标准或其他用户能力评分
- 服务端默认调用 `deepseek-v4-flash`，主模型请求失败后允许切换到 `deepseek-v4-pro`
- 模型失败、超时或返回无效 JSON/schema 时，必须使用同一结构化输入生成规则报告并标记 `fallback`

## 4. 评价维度

节奏：

- 是否卡准重拍
- 是否有提前或滞后
- 动作是否跟音乐情绪一致

身体控制：

- 重心是否稳定
- 发力顺序是否连贯
- 身体分离是否清晰

动作线条：

- 手臂、腿部、躯干是否到位
- 角度是否清楚
- 是否有多余动作

出片表现：

- 镜头距离
- 光线
- 构图
- 表情和眼神
- 穿搭是否影响动作线条观察

## 5. 反馈约束

必须：

- 给出具体时间点
- 每个问题必须通过 `startTime` 和 `endTime` 关联公共时间轴
- 每条建议按“先肯定、指出一个主要问题、解释视觉影响、给出练法、最后鼓励”的顺序表达
- 每次比对必须生成一段 AI 总结
- 每个问题必须有可执行练习或复盘建议
- 优先指出最影响整体观感的问题
- 使用鼓励但不敷衍的语气
- 只在证据充分时使用 rolling、wave、isolation 等专业术语

禁止：

- 只输出分数
- 在用户建议中输出毫秒差、百分比、坐标、关键点编号、像素、检测框或算法名
- 为了凑建议数量而补造没有证据的问题
- 使用医疗诊断语言
- 输出羞辱、身材攻击、性化评价
- 对体重、身材做不必要评价
