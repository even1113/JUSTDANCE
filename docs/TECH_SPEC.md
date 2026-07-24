<!-- version: v0.7 | updated: 2026-07-22 -->
# DanceMirror Tech Spec

## Changelog

- v0.7 (2026-07-22)：补齐 MediaPipe 分阶段诊断、唯一分析步骤、双 Canvas 姿态骨架与手脚轨迹播放
- v0.6 (2026-07-18)：落地真实 API/Worker、PostgreSQL、Redis、OSS、本地磁盘、FFmpeg、DeepSeek v4 与 24 小时清理架构
- v0.5 (2026-07-17)：Demo 引入显式页面状态机与受控后端目标架构
- v0.4 (2026-07-17)：分段音频映射、公共播放轴、多人主体锁定与丢失保护

## 1. 当前技术结论

当前项目是“原生 H5 + 受控 Node.js 后端”的 Beta 实现，不重做现有 Demo，也不引入登录体系。

- H5：文件预校验、本地预览、音轨校准、MediaPipe 姿态提取、目标跟踪、DTW 和结构化差异。
- API：匿名会话、签名上传、任务状态、报告查询、取消、删除和短期播放 URL。
- Worker：FFmpeg 媒体准备和 DeepSeek/规则报告生成。
- PostgreSQL：匿名会话、视频索引、结构化动作结果、任务与最终报告。
- Redis/BullMQ：可重试、可持久化的媒体和分析任务。
- 存储：开发和当前生产环境使用本地磁盘；私有 OSS 是可选存储适配器，尚未作为当前生产部署前置条件。
- 模型：DeepSeek 官方 OpenAI-compatible API，Flash 为主、Pro 为备用。

正式模式不会把原始视频、视频 URL、抽帧、关键点或模型 Key发送给 DeepSeek。

## 2. 运行模式

### embedded

用于无 Docker 的本地开发：

- 内存任务存储；
- 本地磁盘媒体；
- 进程内异步队列；
- 支持真实上传、FFmpeg 转码和 DeepSeek；
- 重启后任务状态不保留，不用于生产。

### persistent

用于 Docker 和生产：

- PostgreSQL 持久化；
- Redis/BullMQ 队列；
- 独立 API、Worker 和 Cleanup 进程；
- 本地共享卷或 OSS 存储；
- API 与 Worker 可独立重启。

## 3. 架构

```text
Mobile H5
  ├─ local preview
  ├─ audio alignment + pose/DTW
  └─ validated structuredAnalysis
          │
          v
Node API ───── PostgreSQL
  │               sessions / video_assets / analysis_tasks
  ├─ signed URL
  v
Local disk or private Alibaba OSS
  │
  v
Redis / BullMQ ── Worker
                    ├─ FFprobe validation
                    ├─ FFmpeg H.264 + AAC
                    ├─ DeepSeek v4 Flash -> v4 Pro
                    └─ rule-report fallback
```

首版把姿态识别保留在 H5，是为了复用已经验证的算法并缩短真实闭环；这不是最终算力位置。完成 3–5 组真实视频压测后，再依据耗时、手机发热、内存和成功率决定是否把抽帧与姿态识别迁入 Worker。

## 4. 核心链路

### 4.1 上传与转码

1. H5 创建匿名 session，持有只用于本次会话的 Bearer token。
2. H5 向 API 提交角色、文件名、类型和大小。
3. API 创建视频索引并返回短期签名 PUT URL。
4. H5 直接上传到本地签名端点或 OSS，不经过 API 内存缓冲。
5. H5 调用 complete；API 校验对象大小并把 `media.prepare` 写入队列。
6. Worker 使用 FFprobe 校验真实容器、时长、尺寸、编码和老师音轨。
7. Worker 使用 FFmpeg 输出 H.264 + AAC、最高 1080p/30fps MP4。
8. H5 轮询 session，直到两段视频均为 ready。

单文件限制：MP4/MOV、500MB、3 分钟。用户无音轨时转码文件补静音 AAC，但分析进入手动音轨校准；老师无音轨直接失败。

### 4.2 动作分析与报告

1. H5 使用老师音轨作为公共时间轴基准，自动对齐失败时接受手动 anchor。
2. MediaPipe Pose Landmarker 从项目本地资源加载，不依赖运行时 CDN。
3. 浏览器逐帧采样整段视频，分别记录采样帧、模型检出帧和 tracker 有效帧；有效帧至少 8 帧且占采样帧 20%，允许短暂遮挡但不接受极低覆盖率。
4. 双侧 tracker 锁定同一目标；不可信时记录 tracking gap，不静默换人。
5. 姿态阶段使用稳定错误码区分 `pose_video_read_failed`、`pose_frame_extraction_failed`、`pose_model_load_failed`、`pose_inference_failed`、`pose_not_detected` 和 `pose_insufficient_frames`，日志只记录角色、视频尺寸、时长、帧数、有效率和失败阶段。
6. 分析过程使用固定唯一 `stepId`；高频推理进度和服务端轮询只更新原步骤，任务成功、失败、取消或离开页面时清理监听和绘制循环。
7. 老师和用户各自使用独立 Canvas，根据视频 `object-fit: contain` 的内容区域换算坐标，并使用真实连续帧绘制关键点、骨架、手腕和脚踝轨迹；播放时覆盖层最高 15fps、设备像素比最高按 2 处理，轨迹窗口使用二分索引，避免遮挡视频解码。
8. 对比播放固定使用老师音轨并始终静音用户音轨；播放、暂停、拖动和倍速不会改变该规则。
9. 双视频同步检查最高 10Hz，时间轴 UI 最高约 15Hz；视频解码、同步校正、Canvas 覆盖层和 UI 更新使用独立节奏。
10. H5 输出无评分的 `structuredAnalysis`，服务端再次运行时校验。
11. Worker 先生成确定性的规则报告，再调用 DeepSeek 改写教练文案。
12. Flash 失败后尝试 Pro；全部失败或输出无效时返回规则报告，任务状态为 `fallback`。
13. 模型只能改变文案，不得改变问题数量、时间区间、严重度和证据。

## 5. API

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/sessions` | 创建匿名会话 |
| GET | `/api/sessions/:id` | 恢复会话和视频状态 |
| DELETE | `/api/sessions/:id` | 删除本次所有数据 |
| POST | `/api/sessions/:id/videos` | 创建视频索引和签名上传目标 |
| POST | `/api/videos/:id/complete` | 完成上传并排队转码 |
| DELETE | `/api/videos/:id` | 删除单个视频并使旧任务失效 |
| POST | `/api/sessions/:id/analysis` | 提交结构化动作分析并排队生成报告 |
| GET | `/api/analysis/:id` | 查询分析状态和报告 |
| DELETE | `/api/analysis/:id` | 取消分析 |
| GET | `/api/health/live` | 进程存活检查 |
| GET | `/api/health/ready` | 存储、数据库和队列就绪检查 |

除创建会话与健康检查外，资源接口均要求本次 session token。Token 只保存 SHA-256 摘要，不写入日志和数据库明文。

## 6. 数据与存储

### PostgreSQL

- `sessions`：状态、当前输入版本、活动任务、24 小时过期时间。
- `video_assets`：角色、原文件信息、存储 key、处理状态、媒体元数据。
- `analysis_tasks`：结构化输入、报告、模型、fallback、错误码和取消时间。

视频二进制不进入数据库。

### OSS

- Bucket ACL 必须为 private。
- 浏览器上传和播放只使用 15 分钟短期签名 URL。
- API/Worker 的对象操作可以使用深圳内网 endpoint；给浏览器的签名 URL 始终使用公网 endpoint。
- RAM 用户只授予目标 Bucket 前缀所需的读取、写入、列举和删除权限。
- CORS 只允许正式 H5 域名执行 PUT/GET/HEAD。

对象前缀：`sessions/{sessionId}/{teacher|user|analysis}/...`。

## 7. 清理和删除

- 任务完成或最后一次有效操作后保留 24 小时。
- Cleanup 进程默认每 60 分钟扫描过期 session。
- 先删除 session 对象前缀，再级联删除 PostgreSQL 会话、视频索引、任务、结构化结果和报告。
- 用户点击“删除本次数据”执行同一数据范围的即时删除。
- OSS 生命周期规则建议设置为 2 天，只处理服务端异常时遗留的对象，不替代业务清理。
- Worker 临时目录无论成功、失败或取消都必须清理。

## 8. DeepSeek

环境变量：

```text
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_FALLBACK_MODEL=deepseek-v4-pro
DEEPSEEK_API_KEY=secret
```

- 只允许 `deepseek-v4-flash` 和 `deepseek-v4-pro`。
- 请求使用 `/v1/chat/completions`、JSON Object 输出和关闭 thinking。
- 默认超时 45 秒，Flash 最多重试一次，随后尝试 Pro。
- 任何 HTTP、超时、JSON 或 Report v1 错误都进入规则报告降级。
- 日志只记录安全错误码和任务 id，不记录 Key、模型请求正文或完整报告。

## 9. 部署

本地持久化环境：

```bash
docker compose up -d --build
```

腾讯云轻量应用服务器单机 Beta：

```bash
docker compose --env-file .env \
  -f docker-compose.yml \
  -f deploy/docker-compose.aliyun.yml \
  up -d --build
```

当前部署为 1 个 API、1 个 Worker（并发 1–2）、1 个 Cleanup、PostgreSQL 和 Redis，运行在腾讯云轻量应用服务器。不要在真实视频压测前建设集群。TLS 可由服务器上的 Nginx 和已备案域名证书终止。

详细步骤见 `docs/DEPLOY_ALIYUN.md`（文件名保留历史命名，内容为腾讯云轻量应用服务器部署）。

## 10. 质量门槛

- `npm run check`：ESLint、HTMLHint、Stylelint、contract/unit/integration tests。
- `npm run build`：生成可发布静态构建并包含本地 MediaPipe 运行时。
- 媒体冒烟：真实 MP4/MOV 上传、FFprobe 校验、FFmpeg 输出和 Range 播放。
- 模型冒烟：只用非敏感结构化 fixture 调用 Flash，并校验 Report v1。
- 容器验收：API/Worker/PostgreSQL/Redis/Cleanup 全部健康。
- 真实视频验收：3–5 对仓库外测试视频，不提交、不公开。
- 移动端：iPhone Safari、Android Chrome、微信内置浏览器。

## 11. 已知边界

- 自动多人代表帧候选尚未完成，当前提供自动主目标与双侧手动框选。
- Pose Landmarker 配置为每帧最多 4 人，返回多个人体检测但不提供跨帧 ReID；密集多人场景仍依赖手动框选、姿态签名和短暂丢失恢复。
- 姿态识别和音轨对齐仍在浏览器执行，低端手机的耗时和内存需真实压测。
- 当前开发机没有 Docker，容器文件只能做静态验证，需在具备 Docker 的机器完成运行验收。
- 腾讯云轻量应用服务器已完成部署和基础冒烟；当前生产使用 `persistent + local`。OSS、RDS/托管 Redis 和多端真实视频验收属于后续优化或外部验收项。
