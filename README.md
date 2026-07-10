# DanceMirror

AI 舞蹈视频比对助手 — 即来即用的 H5 单页面应用。

> 上传老师视频和自己的练舞视频，AI 标出动作路径差异，生成可执行的复盘建议。

## 快速预览

```bash
npm install
npm run serve
```

然后访问 `http://localhost:5173`

也可以直接用浏览器打开 `index.html`。

## 产品特点

- **即来即用**：无需登录注册，打开即用
- **双视频比对**：并排上传老师视频和我的视频
- **逐帧时间轴**：拖动查看每一帧动作
- **AI 复盘报告**：绿色标准路径 + 红色偏差路径，3 个关键问题 + 练习计划
- **移动端优先**：375px 起适配，小屏自动上下堆叠

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
AGENTS.md           — AI 可执行规范
docs/               — 产品工程文档
docs/archive/       — 文档历史版本
tests/              — 测试
tests/contract/     — Contract Test
tests/unit/         — Unit Test
```

## 版本节奏

- v0.1：静态 H5 原型，Mock AI 报告
- v0.2：即来即用 H5，去掉登录/建议/历史（当前）
- v0.3：H5 + 后端 Mock API
- v0.4：真实 AI 抽帧分析 POC
- v0.5：微信小程序测试版

## 文档

| 文档 | 说明 |
|------|------|
| `docs/PRD.md` | 产品需求文档 |
| `docs/DESIGN_SYSTEM.md` | 设计系统 |
| `docs/TECH_SPEC.md` | 技术规范 |
| `docs/AI_SPEC.md` | AI 输出规范 |
| `docs/TASKS.md` | 任务拆解 |
| `docs/HARNESS.md` | AI 开发边界 |
| `AGENTS.md` | AI 可执行规范 |
