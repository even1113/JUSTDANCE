# DanceMirror Codex Tasks

## Task 0: 阅读文档

执行任何代码前，先阅读：

- `docs/PRD.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/TECH_SPEC.md`
- `docs/AI_SPEC.md`
- `docs/HARNESS.md`

然后输出：

1. 你理解的产品目标
2. 当前 MVP 范围
3. 本次准备修改哪些文件
4. 验收方式

## Task 1: 完善 H5 原型

目标：

- 首页上传流程顺畅
- 报告页可读、适合移动端截图
- Mock 数据结构接近 `AI_SPEC.md`

验收：

- 可以上传本地视频并预览
- 不上传老师参考视频也能生成报告
- 报告包含 3 个问题、练习计划、出片建议
- 手机宽度 375px 下无横向滚动

## Task 2: 接入真实 AI 前的后端 mock

目标：

- 增加 `/api/analysis` mock 服务
- 前端从 API 获取报告，不直接使用本地对象

验收：

- 前端调用 API 后展示报告
- API 返回结构符合 `AI_SPEC.md`
- 有 loading、error、retry

## Task 3: 小程序技术选型

目标：

- 决定 Taro 或 uni-app
- 输出迁移方案

验收：

- 有目录结构建议
- 有视频上传和对象存储方案
- 有微信环境限制说明

## Task 4: 真实 AI 分析 POC

目标：

- 先用多模态模型分析短视频或抽帧
- 不追求完整 pose estimation，先验证反馈质量

验收：

- 输入 1 个用户视频和 1 个参考视频
- 输出符合 `AI_SPEC.md`
- 至少 2 条建议能被用户认为具体、可执行

## Task 5: 成长闭环

目标：

- 支持保存报告历史
- 总结用户连续几次重复出现的问题

验收：

- 历史记录可查看
- 能生成「本周最大进步」和「反复出现的问题」

