# AGENTS.md — DanceMirror AI 可执行规范

AI 开发代理在操作本仓库前必须阅读并遵守此文件。

## 1. 产品概览

DanceMirror 是一个即来即用的 H5 舞蹈视频比对助手。用户上传老师视频和自己的练舞视频，AI 生成复盘报告。

- 无登录注册，即来即用
- 单页面：上传 → 比对 → 报告
- 当前为 Mock AI 阶段

## 2. 工作方式

1. 先阅读 `docs/` 下的 PRD、DESIGN_SYSTEM、TECH_SPEC、AI_SPEC、TASKS、HARNESS
2. 输出你对本次任务的理解、将修改的文件、验收方式
3. 确认后再实施
4. 完成后运行 `npm run check`，说明结果

小任务可以直接执行：

```text
请按 AGENTS.md 的约束完成 docs/TASKS.md 里的 Task X。
完成后运行 npm run check，并说明改了什么。
```

## 3. 开发边界

### 应该

- 优先遵守本仓库文档
- 保持移动端优先
- 保持即来即用，不引入登录注册
- 先完成 AI 复盘闭环，不扩展社区和课程
- 把 mock 数据集中管理在 `app.js` 顶部
- 每次修改后运行 `npm run check`

### 不应该

- 擅自改产品定位
- 一次性引入复杂后端、登录、支付
- 把穿搭做成商城
- 把产品变成通用运动平台
- 用泛泛评分替代差异解释
- 引入用户认证、历史记录等非 MVP 功能

## 4. 代码规范

### 文件结构

```text
index.html          — 单页面入口
styles.css          — 全局样式
app.js              — 应用逻辑与 Mock 数据
docs/               — 产品工程文档
docs/archive/       — 文档历史版本
tests/              — 测试
tests/contract/     — Contract Test（验证数据结构）
tests/unit/         — Unit Test
AGENTS.md           — AI 可执行规范（本文件）
```

### 命名

- JS 函数：camelCase
- CSS 类：kebab-case
- 文件：kebab-case
- 常量：UPPER_SNAKE_CASE

### JS 规范

- ESLint recommended
- 2 空格缩进
- 优先 `const`，其次 `let`，不用 `var`
- 单引号
- 无分号

### CSS 规范

- Stylelint standard
- 2 空格缩进
- CSS 变量定义在 `:root`
- 移动端优先，`@media` 递增

### HTML 规范

- 必须 `lang="zh-CN"`
- 必须 viewport meta
- 语义化标签

## 5. 测试规范

### 分层

| 层 | 位置 | 内容 | 运行时机 |
|---|---|---|---|
| Contract Test | `tests/contract/` | 验证 Mock 数据 / AI 输出符合 AI_SPEC schema | 每次 commit |
| Unit Test | `tests/unit/` | 纯函数、工具函数 | 每次 commit |

### Contract Test 规则

验证 `comparisonTemplate` 符合 `docs/AI_SPEC.md` 的输出 schema：

- `title` 是字符串且非空
- `aiSummary` 是字符串且非空
- `mismatches` 是数组，至少 1 项
- 每项必须有 `timestamp`、`title`、`teacherPath`、`userPath`、`advice`
- `drillPlan` 必须有 `durationMin`（数字）和 `steps`（数组）
- `reviewAdvice` 是数组

### 运行

```bash
npm run test       # 运行所有测试
npm run check      # lint + test
```

## 6. 质量门槛

每个功能完成后必须通过：

```bash
npm run check
```

手动检查：

- 页面是否能打开
- 移动端是否无横向滚动
- 上传/删除/重新上传是否可用
- loading/error/empty 状态是否存在
- 报告是否符合 `AI_SPEC.md`

## 7. 文案约束

所有反馈都要符合：

- 具体
- 温和
- 可执行
- 不攻击身材
- 不做医疗诊断

## 8. Git 与版本管理

### 分支策略（Git Flow）

```text
main (受保护，只接受 PR)
 ├── develop (日常开发基线)
 │    ├── feature/task-1-xxx
 │    ├── feature/task-2-xxx
 │    └── ...
 ├── release/v0.3 (发版分支)
 └── hotfix/xxx (紧急修复)
```

- `main` — 受保护，禁止直接 push，必须通过 PR
- `develop` — 开发基线，feature 从此拉出
- `feature/<task-id>-<简述>` — 功能分支，完成后 PR 回 develop
- `release/v<版本号>` — 从 develop 拉出，测试通过后合并到 main + develop
- `hotfix/<简述>` — 从 main 拉出，修复后合并到 main + develop

### Commit Message 格式

```
<type>(<scope>): <subject>
```

type:

- `feat`: 新功能
- `fix`: 修复
- `docs`: 文档
- `style`: 样式
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具

scope:

- `upload`: 上传相关
- `report`: 报告相关
- `compare`: 比对相关
- `docs`: 文档
- `harness`: 规范/工具

示例：

```text
feat(upload): 空状态点击触发文件选择
fix(report): 修复报告不匹配列表渲染
docs(prd): 更新 MVP 范围为即来即用
chore(harness): 添加 ESLint 和 Vitest 配置
```

### Tag 规范

- 格式：`v0.1.0`、`v0.2.0`
- 在 `main` 分支上打 tag
- 每个 release 合并到 main 后打 tag

### 文档版本管理

- `docs/` 下始终放当前版本文档，文件名不带版本号
- 每次文档有重大变更时，将旧版本归档到 `docs/archive/`，加版本号后缀
- 每个文档头部增加版本号和 changelog

## 9. 版本节奏

- v0.1：静态 H5 原型，Mock AI 报告
- v0.2：即来即用 H5，去掉登录/建议/历史（当前）
- v0.3：H5 + 后端 Mock API
- v0.4：真实 AI 抽帧分析 POC
- v0.5：微信小程序测试版
