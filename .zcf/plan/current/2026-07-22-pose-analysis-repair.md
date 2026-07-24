# DanceMirror 姿态分析与过程展示修复计划

## 目标

修复失败过程布局、MediaPipe 链路诊断、真实姿态叠加绘制和分析步骤重复四类问题，在不降低有效帧阈值、不使用 Mock 的前提下完成单人及多人视频验证。

## 实施范围

1. 使用唯一 `stepId` 管理分析过程，失败时区分完成、失败、未执行。
2. 将模型加载、视频读取、抽帧、姿态推理、无人检测、有效帧不足和主体跟踪错误分开报告。
3. 接通老师与用户视频的独立 Canvas，绘制真实关键点、骨架、手腕及脚踝轨迹。
4. 播放、暂停、拖动、缩放及横竖屏变化后继续与视频同步。
5. 清理轮询、Abort 监听和绘制循环，避免重试或离开页面后重复更新。
6. 补齐单元测试、构建检查和 PC/移动端浏览器验证。

## 预计文件

- `app.js`
- `index.html`
- `styles.css`
- `components/PoseCanvas.js`
- `services/poseExtractor.js`
- `hooks/usePoseLandmarker.js`
- `services/comparisonApiClient.js`
- `services/analysisTrace.js`
- `tests/unit/*`
- 与实际行为相关的项目文档

## 验收

- 失败过程在 PC 和移动端左对齐且状态明确。
- MediaPipe 资源、模型和推理都有可辨识的成功或失败状态。
- 单人清晰视频有效帧大于 0。
- 多人视频能够稳定锁定主要人物；超出模型和跟踪能力时给出准确边界。
- 两个视频分别显示真实关键点、骨架和连续轨迹。
- 播放、暂停、拖动后叠加层继续同步。
- 同一 `stepId` 只显示一次，任务结束后相关监听和循环已清理。
- `npm run check` 与 `npm run build` 通过。
- 分别报告本地和 `http://175.178.92.215/` 的实际验证结果。
