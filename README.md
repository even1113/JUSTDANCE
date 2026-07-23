# DanceMirror

DanceMirror 是一个无登录、即来即用的 H5 舞蹈视频复盘助手。用户上传老师示范和自己的练习视频，系统统一视频格式、对齐音乐、锁定目标人物，找出最明显的动作差异并生成可执行的教练式建议。

当前仓库已经进入真实实现阶段，所有入口都使用真实上传、FFmpeg 转码、结构化动作分析、DeepSeek 和规则报告降级链路；演示素材与 Mock 场景入口已移除。

## 本地启动

要求：Node.js 24、npm、FFmpeg/FFprobe。

```bash
npm install
copy .env.example .env
npm run serve
```

访问 `http://127.0.0.1:5173`。默认 `RUNTIME_MODE=embedded`，使用内存任务状态和 `data/` 下的本地磁盘，不依赖 Docker；重启后任务不会保留。

浏览器端不读取 `API_BASE_URL` 或 Vite 变量，所有 API 与本地媒体上传都使用同源 `/api/...`。`PUBLIC_BASE_URL` 只描述服务对外地址，不参与本地存储签名 URL 的拼接。

不要把 `.env`、真实测试视频或媒体临时文件提交到 Git。

## 持久化 Docker 环境

```bash
docker compose up -d --build
docker compose ps
```

该模式启动：

- 1 个 API；
- 1 个 Worker，默认并发 2；
- PostgreSQL；
- Redis/BullMQ；
- 24 小时数据清理进程；
- 本地共享媒体卷。

生产环境使用独立的 `deploy/.env.production`（模板为 `deploy/.env.production.example`），不要复用本地根目录 `.env`。阿里云部署步骤见 [docs/DEPLOY_ALIYUN.md](docs/DEPLOY_ALIYUN.md)。

## DeepSeek

服务端使用 DeepSeek 官方 OpenAI-compatible API：

```text
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_FALLBACK_MODEL=deepseek-v4-pro
DEEPSEEK_API_KEY=...
```

模型只接收经过校验的结构化动作差异，不接收原始视频、视频 URL、帧、关键点或用户文件。Flash 失败后会尝试 Pro；模型失败或输出无效时返回规则报告并标记 `fallback`。

## 核心能力

- MP4/MOV、500MB、3 分钟的客户端与服务端双重校验；
- 签名直传，本地磁盘与阿里云私有 OSS 两种适配器；
- FFmpeg 转为 H.264 + AAC、最高 1080p/30fps；
- 老师音轨强校验，用户无音轨时支持手动校准；
- 双侧人物手动框选、连续跟踪与丢失区间保护；
- Web Audio 对齐、公共时间轴、真实 MediaPipe Pose、DTW 差异分析；
- 双视频独立姿态 Canvas，显示关键点、骨架以及手腕和脚踝连续轨迹；
- 播放固定使用老师音轨、用户视频静音；同步校正、时间轴 UI 和姿态 Canvas 分频执行；
- 使用唯一 `stepId` 记录模型、双视频推理、差异和报告阶段，失败时明确标记未执行步骤；
- 1–3 个非评分式问题、时间轴节点和 Report v1 运行时校验；
- DeepSeek v4 Flash/Pro 和规则报告降级；
- 匿名 session token、取消、stale、替换和“删除本次数据”；
- PostgreSQL、Redis 持久化任务与 24 小时自动清理；
- 移动端优先，MediaPipe 运行时和模型本地化，不依赖页面运行时 CDN。

## 开发命令

```bash
npm run serve          # embedded API + H5
npm run worker         # persistent Worker
npm run migrate        # PostgreSQL migration
npm run cleanup        # 单次清理过期会话
npm run cleanup:watch  # 周期清理进程
npm run lint
npm run test
npm run check          # lint + test
npm run build
```

## 目录

```text
index.html / styles.css / app.js  H5 入口、样式和编排
components/ hooks/ services/      播放、姿态、对齐、报告与 API client
server/                            API、存储、数据库、队列、媒体和模型 Worker
scripts/                           构建资源与压测脚本
deploy/                            阿里云 Compose、Nginx 和部署脚本
docs/                              PRD、设计、技术、AI 与运维文档
tests/                             contract、unit、integration 测试
.spec-workflow/                    SDD requirements/design/tasks
```

## 数据与安全

- 生产视频只存私有 OSS，使用短期签名 URL；视频二进制不进入 PostgreSQL。
- 任务完成后默认保留 24 小时，Cleanup 主动清理，OSS 生命周期只兜底。
- “删除本次数据”覆盖原视频、转码、音频、中间结果、任务和报告。
- `.env`、测试视频、`data/`、媒体和临时文件均由 `.gitignore` 排除。

## 当前限制

- 自动多人代表帧候选尚未完成，当前支持自动主目标与双侧手动框选。
- Pose Landmarker 每帧最多返回 4 个候选；密集多人场景没有完整 ReID，仍需手动框选并允许短暂跟踪丢失。
- 首版音轨和姿态分析在浏览器执行，低端手机性能需要 3–5 组真实视频压测。
- 当前开发机没有 Docker；容器配置尚需在具备 Docker 的机器完成运行验收。
- 2026-07-21 已完成首次 ECS 部署；正式域名、HTTPS 与 OSS 迁移仍待完成。

## 文档

- [PRD](docs/PRD.md)
- [Tech Spec](docs/TECH_SPEC.md)
- [AI Spec](docs/AI_SPEC.md)
- [Aliyun Deployment](docs/DEPLOY_ALIYUN.md)
- [Tasks](docs/TASKS.md)
- [AGENTS.md](AGENTS.md)
