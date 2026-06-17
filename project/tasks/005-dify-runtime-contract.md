# 005 Dify 运行入参契约调整

状态：已完成，真实输出已确认需要本地兼容归一化

## 目标

切换到新的线上 Dify 工作流，并让网站跑分请求匹配该工作流的真实输入契约

## 已确认输入变量

通过 `GET /parameters` 确认新工作流输入变量如下

- `type`：评论类型，书评为 `1`，章评为 `2`，段评为 `3`
- `content`：评论内容
- `prompt_version`：版本，固定传 `V1`
- `is_test`：是否测试，默认传 `0`
- `comment_id`：评论 id，可选，本轮不传

## 已确认输出变量

真实工作流返回的顶层 outputs 只有 `result`

`outputs.result` 当前包含以下字段

- `result`：质量分
- `reason`：评分理由
- `emotion_score`：情绪分
- `version`：工作流版本

为保持网站已有输出契约，后端需要在本地补齐以下字段

- `comment_type`：来自任务行中文评论类型
- `quality_score`：来自 `outputs.result.result`
- `quality_level`：由本地质量映射规则计算
- `quality_reason`：来自 `outputs.result.reason`
- `emotion_score`：来自 `outputs.result.emotion_score`
- `emotion_type`：由本地情绪映射规则计算

## 实现要求

- 本地 `.env` 切换为新工作流 API Key，密钥不进入仓库
- Excel 导入、任务列表、任务详情和导出继续保留中文评论类型
- 后端调用 Dify 时集中把中文评论类型映射为数字编码
- 后端兼容新工作流紧凑输出，并归一化为网站现有六字段结果
- 前端 Prompt 版本选择只作为本地 Prompt 管理配置，当前线上跑分固定发送 `prompt_version=V1`

## 验证要求

- 单元测试覆盖 `书评/章评/段评` 到 `1/2/3` 的映射
- 单元测试覆盖即使本地选择 V2，实际跑分仍发送 `prompt_version=V1` 和 `is_test=0`
- 完成后运行 `npm test`、`npm run typecheck`、`npm run build`
- 服务重启后用三条真实样例验证 Dify 输出仍符合结构化结果契约

## 验证结果

- `npm test` 通过，14 个测试全部通过
- `npm run typecheck` 通过
- `npm run build` 通过
- 本地服务已重启，`GET /api/health` 返回 Dify 已配置
- 临时应用实例使用真实 Dify 跑通书评、章评、段评 3 条样例，任务完成 `successRows=3`、`failedRows=0`
- 真实结果已归一化为 `comment_type/quality_score/quality_level/quality_reason/emotion_score/emotion_type`
