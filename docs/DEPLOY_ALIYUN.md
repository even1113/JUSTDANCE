<!-- version: v0.3 | updated: 2026-07-24 -->
# DanceMirror 腾讯云轻量应用服务器 Beta 部署

DanceMirror 已于 2026-07-24 完成腾讯云轻量应用服务器部署。当前生产版本使用 `persistent + local`，并已完成基础冒烟；正式域名、HTTPS、OSS/RDS/托管 Redis 不是当前部署完成的前置条件。本文件名保留历史命名，实际部署平台以本段为准。

## 1. 部署边界

Beta 目标容量是每天约 20–200 次任务，初期只部署：

- 1 个 API；
- 1 个 Worker，并发 1–2；
- 1 个 Cleanup；
- PostgreSQL；
- Redis；
- 1 个私有 OSS Bucket；
- Nginx 反向代理。

不要在真实视频压测前建设 Kubernetes、自动伸缩或多节点集群。轻量服务器最终规格必须依据第 10 节的真实视频结果确定。

## 2. 需要购买或准备的资源

1. 腾讯云轻量应用服务器，Linux，具备公网访问能力。
2. 已实名认证、可备案的域名。
3. HTTPS 证书或已备案域名，用于服务器 Nginx TLS 终止。
4. 可选：达到稳定 Beta 后迁移到私有 OSS、托管 PostgreSQL 或托管 Redis。

中国内地服务器对外提供网站/API 服务前必须按腾讯云和工信部要求完成 ICP 备案；当前部署平台为腾讯云轻量应用服务器。

## 3. 轻量应用服务器准备

1. 选择深圳地域和与 OSS 相同的 VPC。
2. 系统盘使用 ESSD，预留 Docker 镜像、PostgreSQL、Redis 和临时转码空间。
3. 安装 Docker Engine 与 Compose v2。
4. 安全组只开放：
   - 22：限制为管理员固定 IP；
   - 80：供备案后 HTTP 跳转或负载均衡回源；
   - 443：只在轻量服务器直接终止 TLS 时开放。
5. 不对公网开放 PostgreSQL 5432、Redis 6379 或 API 5173。
6. 开启系统时间同步，确保 OSS 签名 URL 不因时钟偏差失效。

Compose 覆盖文件把 API 5173 只绑定到 `127.0.0.1`，外部流量必须经过 Nginx；文件名 `docker-compose.aliyun.yml` 为历史命名，不代表运行平台依赖阿里云。

## 4. 可选 OSS 配置

当前生产部署未启用 OSS，本节仅保留未来迁移到私有 OSS 时的配置参考，不作为腾讯云轻量服务器部署完成条件。

### 4.1 Bucket

- 地域：`oss-cn-shenzhen`。
- ACL：`private`，并保持阻止公共访问开启。OSS 官方说明 private 只允许拥有者或授权主体访问：[Bucket ACL](https://help.aliyun.com/zh/oss/user-guide/bucket-acl-2)。
- 存储类型：标准存储。
- 版本控制：Beta 默认关闭，避免主动删除后保留旧版本。
- 前缀：所有业务对象都在 `sessions/` 下。

应用启动时会读取 Bucket ACL；非 private 会拒绝进入 ready 状态。

### 4.2 CORS

在 OSS 控制台为正式 H5 域名创建精确规则：

| 设置 | 值 |
|---|---|
| Allowed Origin | `https://你的正式域名` |
| Methods | `PUT`、`GET`、`HEAD` |
| Allowed Headers | `*` |
| Expose Headers | `ETag`、`Content-Length`、`x-oss-request-id` |
| Max Age | `600` |
| Vary: Origin | 开启 |

不要在生产使用 `*` 作为 Origin。浏览器直传 OSS 需要正确的预检规则，具体机制和官方示例见 [OSS CORS 配置](https://help.aliyun.com/zh/oss/user-guide/configure-cross-origin-resource-sharing)。

### 4.3 生命周期兜底

创建规则：

- 前缀：`sessions/`；
- 当前对象：最后修改 2 天后删除；
- 未完成分片：1 天后删除；
- 状态：启用。

业务 Cleanup 仍负责精确的 24 小时清理。OSS 生命周期规则通常按日扫描，并不是 24 小时精确定时，因此只能兜底：[OSS 生命周期概述](https://help.aliyun.com/zh/oss/user-guide/overview-54/)。

### 4.4 RAM 最小权限

如果未来启用 OSS，凭证只放在服务器的 `.env`，不提交 Git。策略至少覆盖目标 Bucket：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:GetBucketAcl",
        "oss:ListObjects"
      ],
      "Resource": [
        "acs:oss:*:*:你的Bucket"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "oss:GetObject",
        "oss:PutObject",
        "oss:DeleteObject"
      ],
      "Resource": [
        "acs:oss:*:*:你的Bucket/sessions/*"
      ]
    }
  ]
}
```

启用前用实际最小权限凭证跑上传、读取、批量删除和 ACL 检查，缺失权限时只补对应动作，不授予整账号管理员权限。

## 5. 环境变量

在轻量服务器项目目录执行：

```bash
cp deploy/.env.production.example deploy/.env.production
chmod 600 deploy/.env.production
```

填入公网地址、随机数据库密码、至少 32 字符的媒体签名密钥、存储配置和 DeepSeek Key。生产文件与本地根目录 `.env` 独立，禁止提交 Git。

必须保持：

```text
APP_NODE_ENV=production
PUBLIC_BASE_URL=https://你的正式域名
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_FALLBACK_MODEL=deepseek-v4-pro
WORKER_CONCURRENCY=1 或 2
```

当前腾讯云轻量服务器部署使用 `STORAGE_DRIVER=local`；如未来迁移 OSS，再使用 `STORAGE_DRIVER=oss` 并设置对应 Bucket 和凭证。浏览器 API 始终走同源 `/api/...`，local 模式的签名上传地址也必须保持相对路径。

建议生成随机密钥：

```bash
openssl rand -hex 32
```

## 6. 首次部署

从本仓库目标 release/commit 获取代码后执行：

```bash
sh deploy/scripts/deploy.sh
```

如果需要显式指定其他受控环境文件：

```bash
ENV_FILE=/secure/path/dancemirror.production.env sh deploy/scripts/deploy.sh
```

脚本默认等价命令：

```bash
docker compose --env-file deploy/.env.production \
  -f docker-compose.yml \
  -f deploy/docker-compose.aliyun.yml \
  up -d --build
```

API 容器启动时先执行幂等数据库迁移；API healthy 后再启动 Worker 和 Cleanup。

### 当前 local 存储部署更新

首次公网版本使用宿主机 Nginx 与 `STORAGE_DRIVER=local` 时，还必须同步更新反向代理：

1. 浏览器 API 请求保持同源 `/api/...`，不要设置前端 `API_BASE_URL`。
2. local 存储签名上传目标必须是相对路径 `/api/storage/upload/...`；`PUBLIC_BASE_URL` 不参与该 URL 的生成。
3. 将 `deploy/nginx/default.conf.template` 中 `/api/storage/upload/` 的独立 location 同步到实际宿主机 Nginx，保持 `client_max_body_size 500m`、`proxy_request_buffering off` 和 900 秒上传超时。
4. 执行 Nginx 配置检查并平滑重载，再重新构建和启动 API/Worker/Cleanup。
5. 创建诊断会话时，只核对上传 URL 的 scheme、host 和 path，不在日志或工单中输出 query、session token 或完整签名。

## 7. DNS、TLS 和备案后开放

1. 备案完成前不要把未备案域名解析到中国内地轻量服务器并对公众提供服务。
2. 在服务器 Nginx 配置证书和 HTTPS 监听。
3. DNS A/CNAME 指向轻量服务器公网入口。
4. 将 `deploy/.env.production` 的 `APP_DOMAIN` 和 `PUBLIC_BASE_URL` 设置为最终域名（DanceMirror 当前为 `dancemirror.blueven.cn`），重新部署。
5. 验证 H5、API 和 OSS 签名 URL 全部使用 HTTPS，页面不得出现 mixed content。

如果不使用负载均衡，可使用仓库提供的 Let’s Encrypt 直连 TLS 配置：

```bash
# 先以 HTTP 启动，使 ACME 校验路径可访问
docker compose --env-file deploy/.env.production \
  -f docker-compose.yml -f deploy/docker-compose.aliyun.yml up -d --build

# 首次签发证书；将邮箱替换为实际运维邮箱
docker compose --env-file deploy/.env.production \
  -f docker-compose.yml -f deploy/docker-compose.aliyun.yml \
  -f deploy/docker-compose.tls.yml --profile certbot run --rm certbot \
  certonly --webroot -w /var/www/certbot \
  -d dancemirror.blueven.cn --email YOUR_EMAIL --agree-tos --no-eff-email

# 切换到 HTTPS，HTTP 会自动 301 到 HTTPS
docker compose --env-file deploy/.env.production \
  -f docker-compose.yml -f deploy/docker-compose.aliyun.yml \
  -f deploy/docker-compose.tls.yml up -d
```

在腾讯云轻量服务器防火墙放行 80 和 443，并确保 DNS A 记录已指向该服务器。续期可每月运行一次同样的 `certbot` 命令（追加 `renew`）后执行 `docker compose ... -f deploy/docker-compose.tls.yml restart nginx`。

## 8. 上线冒烟（已完成）

按顺序验证：

1. `GET /api/health/live` 返回 live。
2. `GET /api/health/ready` 已验证返回 `persistent + local`，且与当前生产环境文件一致。
3. 分别上传老师视频和练习视频；local 模式确认上传目标为同源 `/api/storage/upload/...`，OSS 模式确认私有 Bucket 中出现 `sessions/{id}/...` 对象。
4. 两段视频变为 ready，转码元数据为 H.264 + AAC。
5. 生成报告；Flash 正常时状态 success，暂时使用错误 Key 时状态 fallback 且仍有合法 Report v1。
6. 手机播放签名 URL，并确认 URL 过期后无法继续访问。
7. 点击“删除本次数据”，确认 OSS 前缀和 PostgreSQL 会话均不存在。
8. 创建过期测试 session，运行 `npm run cleanup` 验证自动清理。
9. 查看浏览器控制台、API/Worker 日志和 OSS 请求 ID，不得出现 Key、token 或报告全文。

## 9. 运维与备份

- PostgreSQL：每日加密备份，保留 7 天；恢复演练至少执行一次。
- Redis：开启 AOF；Redis 只保存任务队列，不作为报告真源。
- OSS：保持 private，费用和公网下行设置告警。
- 轻量服务器：CPU、内存、磁盘、load average 和容器重启次数告警。
- Worker：记录任务阶段、耗时、安全错误码和输出大小，不记录用户内容。
- DeepSeek：记录调用次数、模型、耗时、HTTP 状态和 fallback 率，不记录请求正文。

## 10. 真实视频压测与轻量服务器规格决策

先用用户提供的 3–5 组成对视频，保持文件在 Git 之外：

```bash
npm run load-test:media -- \
  --base-url https://你的域名 \
  --teacher /secure/test-videos/teacher.mp4 \
  --user /secure/test-videos/user.mp4 \
  --runs 5 \
  --concurrency 2
```

压测期间同步记录：

- 上传耗时和失败率；
- 两段视频 ready 的 p50/p95；
- FFmpeg 峰值 CPU、内存和临时磁盘；
- Worker 并发 1 与 2 的队列等待；
- H5 姿态分析耗时、手机发热、内存峰值和崩溃率；
- 单任务 OSS、DeepSeek 和公网流量成本。

至少比较两档单机规格，不预设最终答案。选择标准：并发 2 时不触发 OOM，临时磁盘有两倍峰值余量，p95 在产品可接受范围，且连续 20 个媒体任务无 Worker 重启。得到真实数据后再给出正式轻量服务器规格和是否需要把 PostgreSQL/Redis 迁到托管服务。

## 11. 回滚

1. 保留上一个通过冒烟的镜像 tag 和 Git commit。
2. 数据库 migration 当前只新增表/索引，回滚应用时不删除数据结构。
3. 将 Compose 镜像切回上一 tag，执行 `docker compose up -d`。
4. 验证 health、旧任务读取、上传和删除。
5. 禁止使用 `git reset --hard`、强制推送或直接覆盖生产环境文件。
