# DanceMirror

AI 舞蹈视频比对助手 — 即来即用的 H5 单页面应用。

> 上传老师视频和自己的练舞视频，自动完成音乐对齐与人物锁定，找出这一遍最明显的问题并生成可执行的复盘建议。

## 快速预览

```bash
npm install
npm run serve
```

然后访问 `http://localhost:5173`

## 产品特点

- **即来即用**：无需登录注册，打开即用
- **双视频比对**：并排上传老师视频和我的视频
- **双侧人物锁定**：老师和练习视频都可框选目标人物，遮挡时不会静默切换到其他人
- **公共逐帧时间轴**：音轨校准后统一播放、拖动、变速和逐帧查看
- **人体姿态识别**：使用 MediaPipe Pose Landmarker 提取 33 个关键点
- **差异节点定位**：在公共时间轴标记 1–3 个按重要性排序的明显问题
- **AI 复盘报告**：不做能力评分，用舞蹈老师式语言解释表现、影响和下一遍练法
- **受控后端目标**：真实版本由服务端统一管理模型 Key、额度、重试和任务状态；当前 Demo 使用 Mock 服务
- **移动端优先**：375px 起适配，双视频在手机上也始终左右并排
- **移动端人物框选**：在真实视频画面上触控拖框，框选结果按原视频尺寸保存，屏幕缩放不会改变分析区域
- **视频兼容提示**：当前 H5 直接使用浏览器解码，无法解析时会提示改用 H.264 + AAC MP4；正式版本仍需服务端统一转码
- **完整状态演示**：`/?review=1` 可切换自动对齐失败、模型兜底、追踪丢失和阻断错误

## 开发

```bash
npm run lint    # ESLint + HTMLHint + Stylelint
npm run test    # Vitest
npm run check   # lint + test 一键检查
npm run serve   # 启动本地服务
```

## 项目结构

```text
index.html          — 单页面入口
styles.css          — 全局样式
app.js              — 应用逻辑与 Mock 数据
server.js           — 本地静态预览服务
components/         — 双视频播放器与姿态画布
hooks/              — MediaPipe 与视频同步控制
services/           — 姿态提取、归一化、DTW、指标与反馈
types/              — 姿态分析类型说明
AGENTS.md           — AI 可执行规范
docs/               — 产品工程文档
docs/archive/       — 文档历史版本
tests/              — 测试
tests/contract/     — Contract Test
tests/unit/         — Unit Test
```

## 版本节奏

- v0.1：静态 H5 原型，Mock AI 报告
- v0.2：即来即用 H5，双视频同步 + 姿态识别对齐 + Mock/AI 总结（当前）
- v0.3：H5 + 后端 API + 云端历史
- v0.4：真实 AI 抽帧分析 POC
- v0.5：微信小程序测试版

## 文档

| 文档 | 说明 |
|------|------|
| `docs/PRD.md` | 产品需求文档 |
| `docs/DESIGN_SYSTEM.md` | 设计系统与视觉变量 |
| `docs/DEMO_PAGE_MATRIX.md` | 页面清单、还原/推断说明与评审入口 |
| `docs/TECH_SPEC.md` | 技术规范 |
| `docs/AI_SPEC.md` | AI 输出规范 |
| `docs/TASKS.md` | 任务拆解 |
| `docs/HARNESS.md` | AI 开发边界 |
| `AGENTS.md` | AI 可执行规范 |
