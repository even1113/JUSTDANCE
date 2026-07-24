# DanceMirror Structure Steering

## Existing Structure

```text
index.html               页面入口
styles.css               全局样式与设计变量
app.js                   页面编排和事件连接
components/              UI 与播放组件
hooks/                   浏览器媒体能力封装
services/                对齐、姿态、跟踪、反馈和 API 服务
types/                   分析类型说明
tests/contract/          跨层数据契约测试
tests/unit/              纯函数与服务测试
docs/                    产品和工程基线
.spec-workflow/          SDD steering 与 feature specs
```

## Placement Rules

- 页面状态转换放在 `services/appState.js` 或独立状态模块。
- 网络请求放在独立 API client，不在事件处理函数中直接拼装请求。
- 报告 schema、错误码和任务状态必须有单一来源。
- 浏览器端分析模块保持可独立测试，不依赖 DOM。
- 服务端能力在正式引入时使用独立目录，不与浏览器模块混用运行时依赖。
- 新增行为必须同时更新对应 contract/unit test 和 SDD task 状态。
