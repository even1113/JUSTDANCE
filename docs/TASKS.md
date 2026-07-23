<!-- version: v0.7 | updated: 2026-07-23 -->
# DanceMirror Codex Tasks

## Changelog

- v0.7 (2026-07-23)：固定老师音轨、优化双视频播放与姿态覆盖层节奏、修复差异节点独立展开
- v0.6 (2026-07-22)：完成真实 MediaPipe 链路诊断、双视频姿态叠加、唯一分析步骤和单人/多人本地回归
- v0.5 (2026-07-18)：真实上传/转码、持久化队列、DeepSeek/规则降级和删除闭环完成；标记真实视频、容器和云资源验收依赖
- v0.4 (2026-07-18)：按 PRD v0.4 与 SDD 重建正式实现任务；移除客户端 Key、多模型和旧关键帧 Gemini 路线
- v0.3 (2026-07-10)：AI POC 接入，合并 Task 2/3
- v0.2 (2026-07-10)：重新对齐即来即用 H5 范围
- v0.1 (2026-07-01)：初始版本

## 当前阶段

当前已经从“阶段 0：H5 可交互 Demo”进入“阶段 1：H5 + 受控后端分析 API”的实现期。Demo 仍作为产品流与异常状态评审入口，不等同于正式 MVP 已完成。

详细的需求追踪、架构和任务状态位于：

- `.spec-workflow/specs/dancemirror-v0.4/requirements.md`
- `.spec-workflow/specs/dancemirror-v0.4/design.md`
- `.spec-workflow/specs/dancemirror-v0.4/tasks.md`

## Task 0: SDD 开工基线 ✅

- Product、Tech、Structure steering 已建立。
- Requirements、Design、Tasks 已与 PRD v0.4 对齐。
- 当前代码基线通过 `npm run check` 和 `npm run build`。

## Task 1: Report v1 运行时契约 ✅

- 模型、Mock 和 fallback 使用同一份版本化 schema。
- 约束 1–3 个问题、连续优先级、合法时间区间和非评分输出。
- 无效 provider 输出使用稳定 `report_schema_invalid` 错误。

## Task 2: 受控会话与分析任务 API ✅

- 匿名会话凭证、任务查询、取消、stale 和删除已实现。
- 当前使用显式开发 provider；它只用于验证 API 与状态契约。
- 真实上传、转码、分析和模型 provider 尚未接入。

## Task 3: H5 API Client ✅

- 将开发 provider 与前端消费接口解耦。
- 本地与生产模式都通过同源 `/api/...` 驱动真实任务，不保留 Mock 演示入口。
- 取消和删除必须调用后端，迟到结果不得回写。

## Task 4: 真实媒体处理 POC ✅

- 上传 MP4/MOV 并校验容器、时长、大小、画面和音轨。
- FFmpeg 转码为 H.264 + AAC、最高 1080p/30fps。
- 老师音轨缺失、损坏文件、超时和取消都有稳定错误码。

## Task 5: 人物、对齐与动作分析服务化 🚧

- 单人自动锁定、多人候选、手动框选初始化和丢失区间。
- 自动音轨对齐与手动 anchor。
- 输出非评分式结构化动作差异和质量标记。
- 已完成本地 MediaPipe/WASM/模型资源、VIDEO 推理、landmarks 和有效帧统计的真实链路验证。
- 已完成老师/用户独立姿态 Canvas、关键点、骨架、手腕/脚踝轨迹和播放拖动同步。
- 已完成同步检查、时间轴 UI 与姿态覆盖层分频；播放固定老师有声、用户静音，差异节点可独立展开。
- 已修复手动框选区域被重复归一化的问题；密集多人跨帧 ReID 仍属于能力边界。

## Task 6: 受控单模型与 fallback ✅

- 服务端管理唯一主模型的 Key、额度、超时和重试。
- 模型只接收结构化差异。
- 模型失败或 schema 无效时返回已校验 fallback。

## Task 7: Beta 验收 ⛔ 外部依赖

- 上传、替换、取消、删除、多人、手动校准、模型 fallback 全链路验证。
- iPhone Safari、Android Chrome、微信内置浏览器实机验证。
- `npm run check`、`npm run build` 和端到端测试全部通过。

## 当前外部依赖

- 当前 Demo 已确认为 UI 开发与验收基线，不再依赖 Figma。
- DeepSeek v4 Flash 已用本地环境变量完成非敏感结构化冒烟；真实 Key 未输出、未提交。
- FFmpeg/FFprobe 已完成合成视频上传、媒体校验和转码冒烟。
- 当前机器没有 Docker，PostgreSQL/Redis/Compose 运行验收需在具备 Docker 的机器执行。
- 自动多人代表帧候选、其余 3–5 组真实视频、手机实机和阿里云生产依赖验收仍待完成。
