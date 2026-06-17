# 任务拆分与状态

## 阶段 0：项目基线

状态：已完成

目标：建立唯一真实信源、总控协议、任务拆分、Git 节奏和经验沉淀机制。

验收：

- `project/README.md` 存在并说明项目目标。
- `project/BASELINE.md` 存在并记录需求和工作流基线。
- `project/CONTROL.md` 存在并记录总控/子 Agent 协议。
- `project/GIT_POLICY.md` 存在并记录提交策略。
- `project/knowledge/LESSONS.md` 存在并记录经验沉淀规则。

## 阶段 1：网站架构与工程初始化

状态：已完成

任务文件：`project/tasks/001-app-architecture-and-bootstrap.md`

扩展任务：`project/tasks/002-comment-quality-webapp.md`

API 探测：`project/tasks/003-dify-api-probe.md`

目标：建立可运行的网站工程。

候选任务：

- 选择技术栈并写入 `project/DECISIONS.md`。
- 初始化前端和服务端结构。
- 配置 `.gitignore` 和 `.env.example`。
- 提供健康检查接口。
- 本地启动并验证页面可访问。

验收：

- 本地开发服务可以启动。
- 浏览器可以打开首页。
- 健康检查返回 Dify 配置状态，但不泄露密钥。

## 阶段 2：导入与数据校验

状态：已完成

目标：实现评论数据导入、字段映射和校验。

候选任务：

- 支持 CSV 或 XLSX 上传。
- 识别 `comment_type/comment_content` 和中文列名。
- 校验评论类型只能是 `书评`、`章评`、`段评`。
- 展示导入预览、有效行、错误行。

验收：

- 示例文件可导入。
- 缺字段、空内容、非法类型会被标记为错误。
- 错误不会阻塞有效行预览。

## 阶段 3：Dify 批量跑分

状态：已完成

目标：接入目标 Dify 工作流并批量跑分。

候选任务：

- 服务端封装 Dify workflow 调用。
- 批量任务队列或并发控制。
- 单条失败不影响整批继续。
- 记录原始响应和标准化结果。

验收：

- 能对书评、章评、段评分别发起调用。
- 返回字段符合 `BASELINE.md` 输出契约。
- 错误行有明确错误原因。

## 阶段 4：结果查看、筛选与导出

状态：已完成

目标：让运营或产品可以检查结果并导出。

候选任务：

- 表格展示质量分、质量等级、情绪分、情绪类型、理由。
- 按评论类型、质量等级、情绪类型筛选。
- 导出 CSV 或 XLSX。

验收：

- 跑分结果可视化完整。
- 导出文件字段和顺序稳定。
- 导出后可独立打开并核对总行数。

## 阶段 5：验证、交付与经验沉淀

状态：已完成，线上节点写入能力待补充

目标：完成端到端验证、提交代码、沉淀可复用经验。

候选任务：

- 准备最小样例数据。
- 跑端到端测试。
- 记录常见错误和排查方式。
- 根据 Git 策略提交。

验收：

- 有端到端验证记录。
- `project/knowledge/LESSONS.md` 更新。
- Git 状态清楚，提交说明能解释变更范围。

## 阶段 6：质量/情绪 Prompt 优化

状态：V2 Prompt 与离线评估产物已实现，严格准确率待人工标注；当前线上跑分固定使用新工作流 V1

任务文件：`project/tasks/004-prompt-optimization.md`

目标：基于已跑结果分析 V1 误放问题，建立人工标注样本，输出 V2 Prompt，并支持本地网站切换 V1/V2 版本

验收：

- `project/prompt-optimization/accuracy-conclusion.md` 输出当前准确度结论
- `project/prompt-optimization/labeling-sample.csv` 输出 180 条人工标注样本
- `project/prompt-optimization/v1-v2-difference-samples.csv` 输出已发现异常样本的 V1 当前结果与 V2 目标口径
- `project/prompt-optimization/v2-prompts.md` 输出书评、章评、段评 V2 Prompt
- `dify 工作流/社区评论质量评分-书章段评版-prompt-version.yml` 保留 V1 节点并写入 V2 节点
- 前端 Prompt 管理支持选择 V1/V2
- 前端 Prompt 管理支持本地选择 V1/V2，但当前线上 Dify 跑分固定传入 `prompt_version=V1`

## 阶段 7：Dify 运行入参契约调整

状态：已完成

任务文件：`project/tasks/005-dify-runtime-contract.md`

目标：切换新的线上工作流 API Key，并让后端跑分请求匹配新工作流输入变量

验收：

- 本地 `.env` 使用新工作流 API Key，密钥不进入仓库
- Dify 输入变量按 `/parameters` 确认为 `type/content/prompt_version/is_test`
- `书评/章评/段评` 在请求中映射为 `1/2/3`
- 每次请求固定发送 `prompt_version=V1` 和 `is_test=0`
- 本地 UI 与导出仍显示中文评论类型

## 阶段 8：Prompt 自循环优化

状态：已完成，V3 Prompt 为离线候选

任务文件：`project/tasks/006-prompt-self-loop-optimization.md`

目标：基于最新完成任务 `评论打分测试02` 的书评、章评、段评结果，自动分析评分问题，沉淀类型独立标准，并输出 V3 Prompt 候选

验收：

- 最新任务完成后才生成正式产物
- `project/prompt-optimization/self-loop/latest-task-snapshot.md` 记录任务快照和类型分布
- `project/prompt-optimization/self-loop/type-standards.md` 输出书评、章评、段评独立评分标准
- `project/prompt-optimization/self-loop/diagnostic-samples.csv` 输出平台视角诊断样本
- `project/prompt-optimization/self-loop/v3-prompts.md` 输出三类 V3 Prompt
- `project/prompt-optimization/self-loop/v1-v3-review.md` 输出 V1 到 V3 预期改进结论
- `project/prompt-optimization/self-loop/v3-replay-validation.md` 输出 V3 小样本离线回放结论
- `project/prompt-optimization/self-loop/v3-replay-samples.csv` 输出 V3 回放样本表

## 当前阻塞

- Dify App API 已验证可运行 `/workflows/run`，但未暴露线上工作流节点读取或编辑接口；Prompt/映射线上注入需要 Dify 管理端/Console API 或其他写权限。
