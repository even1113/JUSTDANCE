<!-- version: v0.1 | updated: 2026-07-18 -->
# DanceMirror 阿里云深圳 Beta 部署

本文用于“尚未购买云资源”的准备阶段。当前仓库已经提供 Docker、Compose、Nginx、数据库迁移、Worker 和清理进程；只有实际购买 ECS、域名、OSS 并完成备案后，才执行线上部署和冒烟。

## 1. 部署边界

Beta 目标容量是每天约 20–200 次任务，初期只部署：

- 1 个 API；
- 1 个 Worker，并发 1–2；
- 1 个 Cleanup；
- PostgreSQL；
- Redis；
- 1 个私有 OSS Bucket；
- Nginx 反向代理。

不要在真实视频压测前建设 Kubernetes、自动伸缩或多节点集群。ECS 最终规格必须依据第 10 节的真实视频结果确定。

## 2. 需要购买或准备的资源

1. 阿里云深圳地域 ECS，Linux，具备公网访问能力。
2. 已实名认证、可备案的域名。
3. 深圳地域 OSS Bucket。
4. 最小权限 RAM 用户或 RAM 角色。
5. HTTPS 证书，建议在 ALB/SLB 上终止 TLS，回源到 ECS Nginx 80 端口。
6. 可选：达到稳定 Beta 后把本机 PostgreSQL/Redis 替换为 RDS PostgreSQL 和云数据库 Redis。

中国内地服务器对外提供网站/API 服务前必须完成 ICP 备案；阿里云文档也说明，中国内地 ECS 和 OSS 自定义域名等场景需要按接入要求完成备案：[ICP备案服务器检查](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-server-access-information-check)、[备案流程](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview)。

## 3. ECS 准备

1. 选择深圳地域和与 OSS 相同的 VPC。
2. 系统盘使用 ESSD，预留 Docker 镜像、PostgreSQL、Redis 和临时转码空间。
3. 安装 Docker Engine 与 Compose v2。
4. 安全组只开放：
   - 22：限制为管理员固定 IP；
   - 80：供备案后 HTTP 跳转或负载均衡回源；
   - 443：只在 ECS 直接终止 TLS 时开放。
5. 不对公网开放 PostgreSQL 5432、Redis 6379 或 API 5173。
6. 开启系统时间同步，确保 OSS 签名 URL 不因时钟偏差失效。

阿里云 Compose 覆盖文件把 API 5173 只绑定到 `127.0.0.1`，外部流量必须经过 Nginx。

## 4. OSS 配置

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

生产优先使用 ECS RAM 角色；如果首版使用 AccessKey，只放在 ECS 的 `.env`，不提交 Git。策略至少覆盖目标 Bucket：

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

上线前用实际 RAM 角色跑上传、读取、批量删除和 ACL 检查，缺失权限时只补对应动作，不授予整账号 `AliyunOSSFullAccess`。

## 5. 环境变量

在 ECS 项目目录执行：

```bash
cp deploy/.env.aliyun.example .env
chmod 600 .env
```

填入域名、随机数据库密码、至少 32 字符的媒体签名密钥、OSS RAM 凭证和 DeepSeek Key。

必须保持：

```text
APP_NODE_ENV=production
OSS_REGION=oss-cn-shenzhen
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_FALLBACK_MODEL=deepseek-v4-pro
WORKER_CONCURRENCY=1 或 2
```

建议生成随机密钥：

```bash
openssl rand -hex 32
```

## 6. 首次部署

从本仓库目标 release/commit 获取代码后执行：

```bash
sh deploy/scripts/deploy.sh
```

等价命令：

```bash
docker compose --env-file .env \
  -f docker-compose.yml \
  -f deploy/docker-compose.aliyun.yml \
  up -d --build
```

API 容器启动时先执行幂等数据库迁移；API healthy 后再启动 Worker 和 Cleanup。

## 7. DNS、TLS 和备案后开放

1. 备案完成前不要把未备案域名解析到中国内地 ECS 并对公众提供服务。
2. 在 ALB/SLB 配置证书和 HTTPS 监听，将流量回源至 ECS 80。
3. DNS A/CNAME 指向负载均衡或公网入口。
4. 将 `.env` 的 `APP_DOMAIN` 设置为最终域名，重新部署。
5. 验证 H5、API 和 OSS 签名 URL 全部使用 HTTPS，页面不得出现 mixed content。

如果不使用负载均衡，需要自行给 Nginx 增加 443 监听和证书挂载；当前模板只提供负载均衡 TLS 终止后的 HTTP 回源配置。

## 8. 上线冒烟

按顺序验证：

1. `GET /api/health/live` 返回 live。
2. `GET /api/health/ready` 返回 persistent + oss。
3. 上传一组仓库外短视频，OSS 中出现 `sessions/{id}/...` 私有对象。
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
- ECS：CPU、内存、磁盘、load average 和容器重启次数告警。
- Worker：记录任务阶段、耗时、安全错误码和输出大小，不记录用户内容。
- DeepSeek：记录调用次数、模型、耗时、HTTP 状态和 fallback 率，不记录请求正文。

## 10. 真实视频压测与 ECS 规格决策

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

至少比较两档单机规格，不预设最终答案。选择标准：并发 2 时不触发 OOM，临时磁盘有两倍峰值余量，p95 在产品可接受范围，且连续 20 个媒体任务无 Worker 重启。得到真实数据后再给出正式 ECS 规格和是否需要把 PostgreSQL/Redis 迁到托管服务。

## 11. 回滚

1. 保留上一个通过冒烟的镜像 tag 和 Git commit。
2. 数据库 migration 当前只新增表/索引，回滚应用时不删除数据结构。
3. 将 Compose 镜像切回上一 tag，执行 `docker compose up -d`。
4. 验证 health、旧任务读取、上传和删除。
5. 禁止使用 `git reset --hard`、强制推送或直接覆盖生产 `.env`。
