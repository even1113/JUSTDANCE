# DanceMirror v0.4 Tasks

> 状态：`[ ]` 待开始，`[-]` 进行中，`[x]` 已完成，`[!]` 外部依赖阻塞。

- [x] 0. 建立 SDD 基线
  - 创建 product/tech/structure steering。
  - 创建 requirements/design/tasks 并关联 PRD v0.4。
  - 验收：需求、设计、任务均可追踪且不与 PRD 冲突。

- [x] 1. 固化 Report v1 运行时契约
  - 新增独立 schema validator 和标准错误。
  - Mock、fallback、模型响应统一经过校验。
  - 增加有效、无效、越界、排序和评分禁用 contract tests。
  - _Requirements: 1.1–1.4, 5.4_

- [x] 2. 建立受控会话与分析任务 API
  - 创建匿名 session、任务状态查询、取消和删除接口。
  - 引入 provider 接口，首个实现允许使用显式 Mock provider。
  - 测试 cancelled/stale/deleted 终态和迟到结果保护。
  - _Requirements: 2.1, 2.3–2.4, 5.1–5.4, 7.2–7.4_

- [x] 3. 接入 H5 API client
  - 将浏览器端调用与受控 API Client 解耦，不在正式入口保留 Mock provider。
  - 使用 API client 驱动会话、轮询、取消和删除。
  - 保留本地 Demo 模式用于视觉评审，不与正式模式混淆。
  - _Requirements: 2, 5, 7_

- [x] 4. 上传与真实媒体校验 POC
  - 分片/流式上传 MP4、MOV。
  - 服务端读取容器、编码、时长、尺寸和音轨。
  - 明确 500MB、3 分钟、老师音轨缺失错误。
  - _Requirements: 2.2, 3.1, 3.3–3.4_

- [x] 5. 转码 Worker POC
  - 产出 H.264 + AAC、最高 1080p/30fps。
  - 支持取消、超时、临时文件清理和失败重试边界。
  - 在 `D:\tools` 探测/安装非项目内二进制，不提交媒体工具。
  - _Requirements: 3.2–3.4_

- [-] 6. 人物检测、锁定与音轨校准服务化
  - 单人自动锁定、多人候选、手动框选初始化和丢失区间。
  - 自动音轨对齐与手动 anchor API。
  - _Requirements: 4.1–4.4_

- [x] 7. 结构化动作分析与质量控制
  - 输出 1–3 条明显差异，不生成评分。
  - 低质量区间进入 tracking gap。
  - _Requirements: 1, 4.3, 5.1–5.2_

- [x] 8. 受控单模型与 fallback
  - 服务端读取环境变量中的模型配置。
  - 只发送结构化分析，增加超时、重试和 schema 校验。
  - 模型失败使用模板 fallback。
  - _Requirements: 1, 5.4_

- [x] 9. 完成报告回看、隐私和删除闭环
  - 校准差异节点、问题卡、stale、tracking gap 和删除状态。
  - _Requirements: 6, 7_

- [-] 10. 基于现有 Demo 完成 UI 状态与响应式验收
  - 直接复用当前 Demo 页面和设计变量，不等待 Figma。
  - 完成 375/390/430/1440 四个关键布局与真实功能状态校准。
  - 补齐 loading、empty、error、disabled、success、fallback、cancelled 和 stale。

- [!] 11. Beta 验收与发布准备
  - Contract/unit/integration/E2E 全量通过。
  - iPhone Safari、Android Chrome、微信内置浏览器实机验证。
  - 明确数据保留时长、资源限额、服务成本和监控告警。
  - _Requirements: All_

## 当前说明

- Task 6：真实浏览器音轨、姿态、双侧跟踪和手动框选已接入；自动多人代表帧候选及完整服务端迁移尚未完成。
- Task 10：真实状态已接入现有 Demo；375/390/430/1440 浏览器和手机实机矩阵仍需执行。
- Task 11：代码、Docker 和阿里云脚本已准备；等待仓库外真实视频、Docker 运行环境及购买后的 ECS/域名/OSS。
