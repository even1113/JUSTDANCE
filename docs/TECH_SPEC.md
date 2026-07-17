<!-- version: v0.4 | updated: 2026-07-17 -->
# DanceMirror Tech Spec

## Changelog

- v0.4 (2026-07-17): 分段音频时间映射、公共播放轴、多人主体锁定与丢失保护
- v0.3 (2026-07-15): 纯前端音轨对齐、MediaPipe 逐帧姿态识别和 DTW 动作对齐
- v0.2 (2026-07-10): 即来即用 H5，移除 auth API，简化架构
- v0.1 (2026-07-01): 初始版本

## 1. 推荐技术路线

阶段 0：H5 浏览器端分析 POC（当前）

- 目标：快速验证产品流、报告结构、视觉方向
- 技术：HTML/CSS/JavaScript、Web Audio API、MediaPipe Tasks Vision
- 即来即用，无需登录
- 视频、音轨和姿态数据只在浏览器内处理，不依赖业务后端

阶段 1：H5 + 后端 Mock API

- 后端：Node.js/NestJS 或 Next.js API routes
- 存储：对象存储保存视频，数据库保存分析报告

阶段 2：微信小程序 / H5 双端

- 推荐：Taro + React 或 uni-app + Vue
- 原因：用户场景在手机和微信里，便于分享、低门槛试用

阶段 3：独立 App

- 推荐：React Native 或 Flutter
- 前提：已经验证 AI 复盘价值和用户留存

## 2. MVP 架构

```text
H5 Client（单页面、纯前端）
  本地视频 URL
  老师时间轴为主的双视频公共播放控制
  Web Audio 起音包络、全局互相关与分段漂移回归
  公共时间 -> 老师/用户原始时间映射（不修改原视频）
  MediaPipe Pose Landmarker（VIDEO 模式、最多 4 人）
  两侧独立目标跟踪器（框选、预测位置、人体轮廓、关键点形态）
  目标丢失区间与禁止静默换人
  33 个关键点与世界坐标
  归一化 / 平滑 / 插值 / 镜像校正
  DTW 动作序列对齐
  本地评分与结构化问题
        |
        v
Report
  issues
  timestamps
  diff explanation
  drills
  filming/outfit advice
```

当前版本不依赖业务后端。原因是 MVP 不保存用户视频和历史记录，浏览器已能完成音频解码、姿态推理和指标计算；这样可以减少隐私风险和部署复杂度。用户自行配置 API Key 时，结构化分析结果可从浏览器直接发送到模型 API，仅用于自然语言总结，视频本身不会发送给大模型。

播放同步规则：

- 老师视频提供声音并作为主时钟，用户视频静音跟随。
- 公共时间轴根据 `teacherStart / teacherEnd / mapAnchors` 分别映射到两段原始视频。
- 同步误差小于 100ms 时使用不超过 1.5% 的短时速度修正；超过 100ms 时重新定位用户视频。
- 自动音频校准失败时，允许以 0.05 秒步长前后微调并循环当前 4 秒片段。

人物跟踪规则：

- 老师和用户分别保存框选区域与跟踪状态。
- 首帧优先选择与框选区域重叠的人体；未框选时选择可见度和主体面积更高的人体。
- 后续帧综合预测中心、人体框重叠、归一化关键点形态和框选证据匹配。
- 匹配不可信时记录“目标人物暂时丢失”区间并停止绘制骨架，不自动切换到其他候选人。

## 3. 前端页面

MVP 单页面：

- 双视频上传与比对工作台
- AI 复盘报告（页面内展开）

## 4. API 草案

创建分析任务：

```http
POST /api/analysis
```

请求：

```json
{
  "practiceVideoUrl": "https://cdn.example.com/practice.mp4",
  "referenceVideoUrl": "https://cdn.example.com/reference.mp4",
  "danceStyle": "kpop",
  "goal": "timing"
}
```

响应：

```json
{
  "analysisId": "ana_123",
  "status": "queued"
}
```

获取分析结果：

```http
GET /api/analysis/ana_123
```

响应参考 `docs/AI_SPEC.md`。

## 5. 隐私与合规

视频是敏感用户数据，第一版也要有边界：

- 明确告知视频用途
- 不默认公开用户视频
- 不把 AI 建议描述为医疗、康复或专业诊断
- 视频仅在本地预览，后端只在用户确认分析后处理

## 6. 质量要求

- 上传失败、分析失败、视频格式不支持都要有友好提示
- 报告 schema 要稳定，便于前端渲染和后续模型替换
- 所有 mock 数据集中管理，不散落在 UI 中
- 真接 AI 前先写 contract tests，避免模型输出破坏页面
- 每次修改后运行 `npm run check`
