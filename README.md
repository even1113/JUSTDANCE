# DanceMirror

DanceMirror 是一个无登录、移动端优先的 H5 舞蹈视频复盘助手。用户上传老师示范视频和自己的练习视频，系统完成视频校验与转码、音轨对齐、人物锁定、姿态分析和差异报告，帮助用户定位最值得优先改进的动作，并回到对应时间点复看。

当前版本已完成真实用户闭环：上传 → 媒体处理 → 对齐与人物选择 → 姿态和动作差异分析 → 报告生成 → 时间点回看。页面不提供演示素材、Mock 报告或客户端模型 Key。

线上地址：[https://dancemirror.blueven.cn/](https://dancemirror.blueven.cn/)

## 核心功能

- 老师视频和练习视频双上传，支持 MP4/MOV，单文件最大 500MB、最长 3 分钟；
- 服务端校验真实媒体信息，并使用 FFmpeg 转为 H.264 + AAC、最高 1080p/30fps；
- 老师音轨作为公共时间轴基准，自动对齐失败时支持手动校准；
- 双侧人物手动框选、连续跟踪和追踪丢失区间保护；
- 浏览器端使用本地 MediaPipe Pose、Web Audio 和 DTW 完成姿态与动作差异分析；
- 双视频独立播放和姿态 Canvas，老师视频提供声音，练习视频保持静音；
- 输出 1–3 个带时间区间的非评分式问题、依据摘要和可执行练习建议；
- DeepSeek 结构化报告改写失败时自动降级为规则报告；
- 匿名 session、取消、替换、stale 结果隔离和“删除本次数据”；
- 持久化任务由 PostgreSQL、Redis/BullMQ、Worker 和 Cleanup 共同处理。

## 技术架构

```text
移动端 H5
  ├─ 本地视频预览
  ├─ Web Audio 对齐
  ├─ MediaPipe Pose + 目标跟踪
  ├─ DTW 差异分析
  └─ 结构化动作分析结果
          │
          ▼
Node.js API ───── PostgreSQL
  │                  会话、视频索引、任务和报告
  ├─ 签名上传 / 短期播放 URL
  ├─ 本地磁盘或私有 OSS 存储适配器
  └─ Redis/BullMQ ── Worker
                       ├─ FFprobe / FFmpeg 媒体处理
                       ├─ DeepSeek Flash → Pro
                       └─ 规则报告 fallback
```

运行模式：

- `embedded`：本地开发模式，使用内存任务状态和本地磁盘，不需要 Docker；
- `persistent`：生产模式，使用 PostgreSQL、Redis、独立 Worker、Cleanup 和持久化媒体存储。

模型服务只接收经过校验的结构化动作差异，不接收原始视频、视频 URL、帧、关键点或用户文件。API Key 只通过服务端环境变量注入。

## 本地启动

要求：Node.js 24、npm、FFmpeg/FFprobe。

```bash
npm install
copy .env.example .env
npm run serve
```

访问 `http://127.0.0.1:5173`。浏览器 API 始终使用同源 `/api/...`，不读取 `API_BASE_URL` 或 Vite 变量。

## 持久化环境

```bash
docker compose up -d --build
docker compose ps
```

生产环境使用独立的 `deploy/.env.production`（模板为 `deploy/.env.production.example`），不要复用本地根目录 `.env`。当前线上部署在腾讯云轻量应用服务器，运行 `persistent + local`，具体步骤见 [腾讯云轻量应用服务器部署说明](docs/DEPLOY_ALIYUN.md)。该文件名保留历史命名，内容以腾讯云部署为准。

## DeepSeek 配置

```text
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_FALLBACK_MODEL=deepseek-v4-pro
DEEPSEEK_API_KEY=...
```

Flash 失败后会尝试 Pro；模型请求失败或输出不符合 Report v1 schema 时，系统返回规则报告并标记 `fallback`。

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

## 目录结构

```text
index.html / styles.css / app.js  H5 入口、样式和编排
components/ hooks/ services/      播放、姿态、对齐、报告与 API client
server/                            API、存储、数据库、队列、媒体和模型 Worker
scripts/                           构建资源与媒体压测脚本
deploy/                            服务器 Compose、Nginx 和部署脚本
docs/                              PRD、设计、技术、AI 与运维文档
tests/                             contract、unit、integration 测试
```

## 数据与安全

- 当前生产视频存储在腾讯云轻量应用服务器的本地私有磁盘，播放使用短期签名 URL；
- 任务完成后默认保留 24 小时，由 Cleanup 主动清理；
- “删除本次数据”覆盖原视频、转码文件、音频、中间结果、任务和报告；
- `.env`、真实测试视频、`data/`、媒体和临时文件均由 `.gitignore` 排除。

## 文档

- [PRD](docs/PRD.md)
- [技术规格](docs/TECH_SPEC.md)
- [AI 规格](docs/AI_SPEC.md)
- [腾讯云部署说明](docs/DEPLOY_ALIYUN.md)
- [任务清单](docs/TASKS.md)
- [AGENTS.md](AGENTS.md)
