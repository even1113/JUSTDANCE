# DanceMirror Tech Spec

## 1. 推荐技术路线

阶段 0：H5 静态原型

- 目标：快速验证产品流、报告结构、视觉方向
- 技术：HTML/CSS/JavaScript，无依赖
- 当前仓库已经实现

阶段 1：微信小程序 / H5 双端

- 推荐：Taro + React 或 uni-app + Vue
- 原因：用户场景在手机和微信里，便于分享、低门槛试用
- 后端：Node.js/NestJS 或 Next.js API routes
- 存储：对象存储保存视频，数据库保存分析报告和成长记录

阶段 2：独立 App

- 推荐：React Native 或 Flutter
- 前提：已经验证 AI 复盘价值和用户留存

## 2. MVP 架构

```text
Mobile client
  upload video
  choose dance type
  request analysis
        |
        v
Backend API
  create analysis job
  store video
  call AI analysis pipeline
        |
        v
AI pipeline
  video metadata
  pose estimation, later
  multimodal model
  dance knowledge prompt
  structured report schema
        |
        v
Report
  issues
  timestamps
  diff explanation
  drills
  filming/outfit advice
```

## 3. 前端页面

MVP 页面：

- UploadScreen
- AnalyzingScreen
- ReportScreen

后续页面：

- HistoryScreen
- GrowthProfileScreen
- DrillLibraryScreen

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
- 用户可删除视频和报告
- 不默认公开用户视频
- 不把 AI 建议描述为医疗、康复或专业诊断
- 未成年人场景需要额外处理，MVP 暂不主动面向未成年人

## 6. 质量要求

- 上传失败、分析失败、视频格式不支持都要有友好提示
- 报告 schema 要稳定，便于前端渲染和后续模型替换
- 所有 mock 数据集中管理，不散落在 UI 中
- 真接 AI 前先写 contract tests，避免模型输出破坏页面

