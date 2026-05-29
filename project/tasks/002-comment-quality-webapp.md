# 002 评论质量打分网站

状态：MVP 已实现，线上注入待 Dify 写权限确认

## 目标

基于 `dify 工作流/社区评论质量评分-书章段评版.yml` 做一个网站，实现手动导入 Excel 评论，通过 Dify 工作流批量跑分，并输出结构化结果。

## 成功标准

MVP 完成时必须满足：

- 可以上传 Excel 文件导入评论。
- 导入数据至少包含 `comment_type/comment_content`，并兼容中文列名 `评论类型/评论内容`。
- 可以创建并查看批量跑分任务。
- 可以对有效评论行调用 Dify 工作流跑分。
- 可以展示每行的结构化结果：
  - `comment_type`
  - `quality_score`
  - `quality_level`
  - `quality_reason`
  - `emotion_score`
  - `emotion_type`
- 可以导出结构化结果文件。
- 可以管理书评、章评、段评各自的打分 Prompt。
- 可以管理 `quality_score -> quality_level` 和 `emotion_score -> emotion_type` 的映射规则。
- Prompt 和映射调整后，可注入到 Dify 对应节点。
- 完成前必须用实际命令或浏览器运行结果验证。

## MVP 边界

保持简单，先做单机本地管理后台：

- 不做登录鉴权。
- 不做多人协作。
- 不做复杂权限。
- 不做线上部署。
- 不做图片、表情包、视频或链接评估。
- 不做超过当前 Dify 工作流契约的额外模型能力。

## 功能模块

### 1. 任务管理

- 新建任务：上传 Excel，生成任务。
- 任务列表：展示任务名、状态、总行数、成功数、失败数、创建时间。
- 任务详情：展示导入预览、校验错误、跑分进度、结果表。
- 重新跑分：允许对失败行或全部行重新执行。

### 2. Prompt 管理

- 三个独立 Prompt：
  - 书评打分 Prompt
  - 章评打分 Prompt
  - 段评打分 Prompt
- 支持编辑、保存、恢复默认。
- 支持注入到 Dify 对应 LLM 节点。

### 3. 映射规则管理

- 质量映射：`quality_score -> quality_level`
- 情绪映射：`emotion_score -> emotion_type`
- 支持编辑区间、标签、保存、恢复默认。
- 支持注入到 Dify 可配置映射节点。

## 关键技术假设

- 网站工程优先使用 Vite + React + TypeScript + Node/Express。
- Excel 解析使用成熟库，不手写解析器。
- 本地任务和配置先用文件系统持久化，后续需要再迁移数据库。
- Dify API Base URL、API Key、Workflow ID 通过 `.env` 配置。

## 需要先确认

- UI 视觉方向。
- Excel 上传是否只要求 `.xlsx`，还是同时支持 `.xls`。
- “注入到 Dify 对应节点”优先采用导出新版 YAML，还是直接调用 Dify API 更新工作流；MVP 建议先做“生成可导入新版 YAML”，避免线上工作流误改。

## 当前总控判断

UI 视觉方向已通过。Dify 注入方式按用户要求改为直接调用线上 API 修改工作流。

实现前必须验证：

- 当前 API Key 是否可运行目标工作流。
- Dify 应用 API 是否支持读取和修改工作流节点。
- 如果不支持线上工作流编辑，需记录阻塞并回收为可实施方案。

## 2026-05-29 实现进展

- 已建立 Vite + React + TypeScript 前端和 Node/Express 后端。
- 已支持 Excel 上传导入、任务列表、任务详情、调用 Dify `/workflows/run` 跑分、结构化结果展示和 XLSX 导出。
- 已支持本地 Prompt 与映射规则编辑保存。
- 已修复中文 Excel 文件名显示乱码问题。
- 书评、章评、段评 Prompt 默认值已从 `dify 工作流/社区评论质量评分-书章段评版.yml` 中对应打分节点提取为完整节点 Prompt。
- 已增加配置迁移：若本地保存的是早期简化默认 Prompt，读取配置时自动升级为工作流节点完整 Prompt。
- `POST /api/config/inject` 当前返回 501，原因是现有 Dify App API 已验证可运行工作流，但没有暴露线上工作流节点编辑端点。
- 已支持任务级整体暂停和继续：暂停会在当前 Dify 单条调用完成后停止继续处理，继续会从未完成/失败行接着跑。
- 任务列表最多保留最新 5 条记录；前端列表默认展示约 2 条高度，支持滚动查看剩余记录。

## 2026-05-29 验证记录

- `npm test`：通过，覆盖默认 Prompt 来源和旧简化 Prompt 迁移。
- `npm run typecheck`：通过。
- `npm run build`：通过。
- `GET /api/config`：书评/章评/段评 Prompt 长度分别为 988/1012/977，且包含“不要输出quality_level或emotion_type”节点约束。
- in-app Browser DOM 与交互验证：页面标题为“评论质量打分控制台”；Prompt 来源提示可见；书评/章评/段评标签切换后 textarea 长度分别为 988/1012/977；浏览器控制台无 error/warn。
- Browser 截图接口 `Page.captureScreenshot` 本轮连续超时，未取得截图证据；已保留 DOM、接口和交互证据。

## 2026-05-29 任务控制验证记录

- `npm test`：通过，覆盖任务列表最多 5 条、任务整体暂停和继续。
- `npm run typecheck`：通过。
- `npm run build`：通过。
- API 验证：连续导入样例后 `GET /api/tasks` 返回 `count=5`。
- in-app Browser DOM 与交互验证：任务列表 `rowCount=5`，`.task-table` 高度 `126px`，滚动高度 `265px`，`overflow-y=auto`；暂停/继续按钮存在，当前未运行任务下禁用，开始跑分按钮可用；浏览器控制台无 error/warn。
