<!-- version: v0.3 | updated: 2026-07-10 -->
# DanceMirror Codex Tasks

## Changelog

- v0.3 (2026-07-10): AI POC 接入，合并 Task 2/3
- v0.2 (2026-07-10): 重新对齐即来即用 H5 范围
- v0.1 (2026-07-01): 初始版本

## Task 0: 阅读文档

执行任何代码前，先阅读：

- `docs/PRD.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/TECH_SPEC.md`
- `docs/AI_SPEC.md`
- `docs/HARNESS.md`
- `AGENTS.md`

然后输出：

1. 你理解的产品目标
2. 当前 MVP 范围
3. 本次准备修改哪些文件
4. 验收方式

## Task 1: 完善 H5 原型 ✅

目标：

- 单页面即来即用比对流程
- 报告页可读、适合移动端截图
- Mock 数据结构接近 `AI_SPEC.md`

验收：

- 可以上传本地视频并预览
- 不上传老师参考视频也能生成报告
- 报告包含 3 个问题、练习计划、复盘建议
- 手机宽度 375px 下无横向滚动
- `npm run check` 通过

## Task 2: AI 分析 POC ✅

目标：

- 前端抽帧，发送关键帧给多模态 LLM（Gemini API）
- 不填 API Key 时回退到 Mock 数据
- API 设置面板可配置 endpoint/model/key
- 输出符合 `AI_SPEC.md` schema

验收：

- 填入 Gemini API Key 后，上传两个视频可生成真实 AI 报告
- 不填 Key 时使用 Mock 数据，功能不受影响
- 报告结构符合 `AI_SPEC.md`
- `npm run check` 通过

## Task 3: AI 分析质量优化

目标：

- 优化抽帧策略（关键动作点而非均匀采样）
- 优化 prompt，提升反馈质量
- 支持更多 OpenAI 兼容 API（OpenAI、Ollama 等）

验收：

- AI 反馈至少 2 条建议被用户认为具体、可执行
- 支持 OpenAI 兼容 API 格式
- `npm run check` 通过

## Task 4: 成长闭环（后续版本）

目标：

- 支持保存报告历史
- 总结用户连续几次重复出现的问题

验收：

- 历史记录可查看
- 能生成「本周最大进步」和「反复出现的问题」
