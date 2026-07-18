# DanceMirror Beta 运维检查表

## 每次发布

- `npm run check` 与 `npm run build` 通过。
- 目标 commit 已推送到 feature/release 分支并经过 PR。
- `.env`、真实视频、`data/` 和媒体文件未进入 Git。
- 数据库迁移先在备份环境执行。
- API、Worker、Cleanup、PostgreSQL、Redis 全部 healthy。
- 上传、转码、报告、fallback、删除完成一次冒烟。

## 每日

- 检查 API/Worker/Cleanup 重启次数和错误率。
- 检查 BullMQ waiting/failed 数量和最老任务等待时间。
- 检查磁盘、PostgreSQL、Redis AOF 和 OSS 费用。
- 检查 DeepSeek success/fallback 比例，不查看用户内容。

## 每周

- 抽查过期 session 是否在 24–26 小时窗口内清理。
- 验证 OSS `sessions/` 下没有超过 2 天的遗留对象。
- 验证 PostgreSQL 备份可读取；定期做恢复演练。
- 审查 RAM、SSH、安全组和管理员权限。

## 事故优先级

1. 数据公开、Key/token 泄露：立即下线入口、轮换密钥、保留安全日志并排查访问范围。
2. 删除失败或超过保留期：暂停新任务，修复 Cleanup，执行受控补清理。
3. 转码积压：把 Worker 并发降到稳定值或临时停止接收新任务，不丢弃队列。
4. DeepSeek 故障：保持规则报告 fallback，不阻断媒体与复盘闭环。
5. 单个媒体失败：保留错误码，允许用户重传，不记录或复制用户视频到调试环境。
