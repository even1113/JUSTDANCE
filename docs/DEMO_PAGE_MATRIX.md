<!-- version: v1.0 | updated: 2026-07-17 -->
# DanceMirror Demo 页面清单与还原说明

## 1. 核心用户流程

```text
添加老师视频 + 我的练习视频
  → 自动转码 / 音乐对齐 / 人物检测
  → 检测多人时依次选择老师和自己
  → 自动对齐失败时手动选择同一动作起点
  → 同步播放确认
  → 生成动作分析
  → 在时间轴定位 1–3 个差异并阅读练法
```

任一处理任务中更换视频都会取消当前任务并返回上传；报告不会本地持久化，用户可主动删除本次数据。

## 2. 页面/状态矩阵

| 页面或状态 | 路径位置 | 视觉依据 | Demo 覆盖 |
|---|---|---|---|
| 双视频上传 | 入口 | 基于方向三风格推断补全 | 文件选择、预览、删除、格式/大小/时长校验、演示素材 |
| 视频准备中 | 上传后 | 基于风格推断补全 | 转码、音乐对齐、人物检测步骤；处理中换视频 |
| 多人目标选择 | 准备后条件分支 | 参考 Figma 主体锁定画面并补全 | 先老师后用户、候选高亮、手动框选反馈 |
| 手动音乐校准 | 自动对齐失败分支 | 基于风格推断补全 | 双时间轴选点、确认、自动重试 |
| 同步比对确认 | 分析前 | 严格参考方向三双视频控制框 | 并排视频、人物锁定、公共进度、逐帧、倍速、循环 |
| 动作分析中 | 生成后 | 基于风格推断补全 | 三步进度、取消、换视频、模型兜底提示 |
| 复盘报告 | 核心结果 | 参考方向三报告与控制框并融合新 PRD | 无评分；1–3 条差异；时间轴节点联动；依据折叠；练习计划 |
| 追踪丢失 | 报告条件状态 | 基于需求推断补全 | 时间轴区间、停止该片段结论、恢复建议 |
| 阻断错误 | 处理失败 | 基于风格推断补全 | 错误说明、重试、更换视频 |
| 隐私与删除 | 全局辅助流 | 基于风格推断补全 | 底部抽屉、二次确认、删除成功反馈 |

## 3. 可复用组件

- Button：Primary / Secondary / Text / Danger，含 disabled/loading
- Video Upload Card：teacher/user × empty/selected/error
- Role Label：teacher/user
- Status Badge：neutral/working/success/reference/error
- Process Stepper：pending/active/complete/error
- Subject Candidate Card：default/selected/recommended
- Comparison Workspace：ready/report × local/demo
- Timeline Marker：high/medium/low/active；Tracking Gap
- Issue Card：default/active/reference-only，判断依据折叠
- Modal、Bottom Drawer、Toast

## 4. Review 方式

正常入口访问 `/`。访问 `/?review=1` 会显示仅供评审使用的场景工具栏，可切换：

- 标准多人流程
- 自动对齐失败
- 模型调用失败后的结构化兜底
- 追踪丢失
- 视频处理阻断错误

评审工具栏不属于正式产品界面，生产构建默认隐藏。

## 5. 当前假设与替换边界

- 当前没有完整 Figma 组件树，除双视频控制框与主要色彩外均按 PRD/UI_SPEC 推断补全
- Demo 使用 Mock 服务模拟受控后端任务，不上传真实视频；本地文件仅生成内存 URL
- “手动框选”当前提供可点击的中央区域锁定反馈，正式实现需替换为可拖拽选框和真实跟踪器
- Demo 姿态图为代码生成 SVG 占位，不是截图；后续可替换为真实视频帧或品牌素材
- 页面模块和状态机已解耦，获得完整 Figma 后可逐组件替换样式，不需要重做业务路径
