# DanceMirror Technical Steering

## Current Stack

- 前端：原生 HTML、CSS、JavaScript ES Modules。
- 浏览器能力：Web Audio API、Canvas、MediaPipe Tasks Vision。
- 测试与质量：ESLint、HTMLHint、Stylelint、Vitest。
- 当前服务：Node.js 内置 HTTP 静态预览服务。

## Target Architecture

- H5 只负责文件预校验、本地预览、任务控制、同步回放和报告展示。
- 受控后端负责上传、转码、任务状态、人物检测、对齐、结构化分析、模型调用和删除。
- 模型只接收结构化动作差异，不接收浏览器端 API Key、原始关键点或完整视频。
- 模型失败进入 `fallback`，不得转成全局失败。

## Engineering Rules

- 保持现有模块边界，避免把分析逻辑重新堆回 `app.js`。
- 外部数据进入 UI 前必须经过运行时 schema 校验。
- 异步任务必须带任务版本或凭证，取消后的迟到结果不得回写。
- 不引入登录、数据库迁移或大型框架，除非对应 SDD 任务明确批准。
- 每个任务完成后运行 `npm run check`，发布前运行 `npm run build`。

## Canonical References

- 技术边界：`docs/TECH_SPEC.md`
- AI 输出：`docs/AI_SPEC.md`
- 交互与状态：`docs/UI_SPEC.md`
- 代码规范：`AGENTS.md`
