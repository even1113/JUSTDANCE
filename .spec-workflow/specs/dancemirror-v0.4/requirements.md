# DanceMirror v0.4 Requirements

## Introduction

本规格把 `docs/PRD.md` v0.5 转换为可实施、可追踪的研发需求。目标是将当前可交互 Demo 推进为 H5 + 受控后端的正式 MVP，同时保留无登录、单页面和移动端优先的产品边界。

## Alignment with Product Vision

实现必须服务于“找到明显差异、解释为什么、告诉下一遍怎么练”的核心结果。上传、转码、人物锁定、对齐和模型只是达成该结果的基础设施，不得在普通用户界面暴露技术参数。

## Requirements

### Requirement 1: Canonical Report Contract

**User Story:** 作为用户，我希望任何分析结果都能稳定展示，从而不会因为模型字段异常看到空白或错误内容。

#### Acceptance Criteria

1. WHEN 任意报告进入前端 THEN 系统 SHALL 按唯一版本化 schema 做运行时校验。
2. IF `mismatches` 少于 1 条、多于 3 条或时间区间非法 THEN 系统 SHALL 拒绝模型报告并使用已校验的结构化兜底结果。
3. WHEN 报告有效 THEN 系统 SHALL 保证问题按 `priority` 升序且不包含用户评分字段。
4. IF 片段质量不足 THEN 系统 SHALL 使用 `reference-only` 或 tracking gap，不生成确定性动作结论。

### Requirement 2: Controlled Video Session

**User Story:** 作为用户，我希望两段视频由同一受控任务处理，从而能够替换、取消和删除且不会混入旧结果。

#### Acceptance Criteria

1. WHEN 客户端创建比对 THEN 服务端 SHALL 返回匿名 `sessionId` 和仅限本次任务的访问凭证。
2. WHEN 任一视频上传 THEN 服务端 SHALL 校验角色、格式、大小、时长和真实媒体信息。
3. WHEN 用户替换或删除视频 THEN 系统 SHALL 取消相关旧任务并使派生结果失效。
4. IF 旧任务在取消后返回 THEN 客户端 SHALL 忽略该结果。

### Requirement 3: Upload and Transcode

**User Story:** 作为手机用户，我希望 MP4/MOV 被统一为可分析格式，从而不受拍摄设备编码差异影响。

#### Acceptance Criteria

1. WHEN 文件通过客户端预校验 THEN 系统 SHALL 立即显示本地预览并开始上传。
2. WHEN 上传完成 THEN 服务端 SHALL 转为最高 1080p、30fps、H.264 + AAC MP4。
3. IF 文件超过 500MB、3 分钟或媒体损坏 THEN 系统 SHALL 返回明确错误码和重新选择入口。
4. IF 老师视频没有可用音轨 THEN 系统 SHALL 阻断正式分析。

### Requirement 4: Subject Lock and Alignment

**User Story:** 作为用户，我希望系统始终分析我指定的人并对齐同一段音乐，从而相信差异来自正确对象和片段。

#### Acceptance Criteria

1. WHEN 只检测到一个稳定人物 THEN 系统 SHALL 自动锁定并允许用户重新选择。
2. WHEN 检测到多人 THEN 系统 SHALL 分别要求选择老师和用户侧目标人物。
3. IF 跟踪不可信 THEN 系统 SHALL 记录丢失区间且不得静默切换人物。
4. WHEN 自动音轨对齐失败 THEN 系统 SHALL 提供手动对应起点校准。

### Requirement 5: Analysis Task and Model Fallback

**User Story:** 作为用户，我希望分析过程可理解、可取消，即使模型失败也能看到基础复盘。

#### Acceptance Criteria

1. WHEN 双视频 ready、人物锁定且音轨校准完成 THEN 系统 SHALL 允许创建分析任务。
2. WHEN 任务运行 THEN 系统 SHALL 返回真实阶段状态而非伪造百分比。
3. WHEN 用户取消 THEN 服务端 SHALL 标记任务 cancelled，客户端 SHALL 保留可复用的视频准备结果。
4. IF 主模型超时、失败或返回无效 schema THEN 系统 SHALL 返回 `fallback` 报告而非全局 error。

### Requirement 6: Review Loop

**User Story:** 作为用户，我希望点击差异节点就能回看对应片段并理解如何练习。

#### Acceptance Criteria

1. WHEN 报告生成 THEN 系统 SHALL 在共享时间轴展示 1–3 个可访问的差异区间。
2. WHEN 播放进入区间 THEN 系统 SHALL 激活对应问题卡。
3. WHEN 用户点击节点 THEN 系统 SHALL 定位区间起点并暂停双视频。
4. WHEN 多区间重叠 THEN 系统 SHALL 按 high、medium、low 和开始时间确定激活项。

### Requirement 7: Privacy and Data Deletion

**User Story:** 作为用户，我希望知道视频如何使用，并能删除本次数据。

#### Acceptance Criteria

1. BEFORE 上传 THEN 页面 SHALL 提供可找到的数据处理说明。
2. WHEN 用户确认删除 THEN 服务端 SHALL 删除本次视频、任务和报告数据。
3. WHEN 删除成功 THEN 客户端 SHALL 清空所有本地引用并回到双空状态。
4. IF 删除失败 THEN 页面 SHALL 保留当前状态并允许重试。

### Requirement 8: Persistent Beta Runtime

**User Story:** 作为 Beta 运营者，我希望服务能够在单机重启和模型故障后保持可恢复，从而支撑每天约 20–200 次任务。

#### Acceptance Criteria

1. WHEN 运行在生产模式 THEN 系统 SHALL 使用 PostgreSQL 保存任务、报告和文件索引，视频二进制 SHALL 存入私有 OSS。
2. WHEN API 接受媒体或分析任务 THEN 系统 SHALL 使用 Redis 持久化队列，并允许 1 个 Worker 以 1–2 并发处理。
3. WHEN 任务完成或最后一次有效操作超过 24 小时 THEN 服务端 SHALL 删除对象前缀和对应数据库数据。
4. WHEN 模型调用发生 THEN 服务端 SHALL 默认使用 `deepseek-v4-flash`，允许切换 `deepseek-v4-pro`，且只发送经过校验的结构化分析。
5. WHEN 缺少云资源 THEN 项目 SHALL 仍提供本地磁盘适配器、Docker Compose、部署脚本和阿里云深圳部署文档。

## Non-Functional Requirements

### Architecture

- 前端网络层、业务状态、媒体分析和 UI 渲染必须保持分离。
- 所有外部输入必须有运行时验证和标准化错误码。
- Mock provider 与正式 provider 必须通过同一接口替换。

### Performance

- 375px 宽度无横向滚动。
- 长任务可取消；切回页面后可恢复真实任务状态。
- 首版分析资源上限和超时必须可配置并可观测。

### Security and Privacy

- 客户端和仓库不保存模型 API Key。
- `.env`、真实测试视频、用户媒体和临时媒体不得进入 Git。
- 不采集文件名、本地路径、视频画面、原始关键点或报告全文作为埋点。
- 匿名任务凭证只能访问和删除对应会话。

### Reliability and Usability

- loading、empty、error、disabled、success、fallback、cancelled 均有明确状态。
- 支持 iPhone Safari、主流 Android Chrome、微信内置浏览器；桌面 Chrome 用于辅助验证。
