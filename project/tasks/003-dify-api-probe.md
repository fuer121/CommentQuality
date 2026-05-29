# 003 Dify API 能力探测

状态：已完成

## 目标

验证用户提供的 Dify API 配置能否支持：

- 读取应用输入参数。
- 调用工作流跑分。
- 修改线上工作流节点。

## 配置

- API Base URL：已写入本地 `.env`
- API Key：已写入本地 `.env`，不提交

## 探测结果

### 已确认可用

- `GET /parameters` 可读取应用输入参数。
- `GET /site` 可读取站点信息。
- `GET /info` 可读取应用信息。
- `POST /workflows/run` 可运行工作流。

工作流运行样例已成功：

- HTTP 状态：200
- workflow_run_id：`f0d2645a-c4ef-433d-81aa-f568b339d139`
- 运行状态：`succeeded`
- 输出字段符合契约：
  - `comment_type`
  - `quality_score`
  - `quality_level`
  - `quality_reason`
  - `emotion_score`
  - `emotion_type`

### 当前未确认可用

以下路径返回 404，不能作为工作流编辑 API 使用：

- `GET /workflows`
- `GET /workflows/draft`
- `GET /workflow`
- `GET /apps`
- `GET /app`

## 总控判断

当前 App API Key 能稳定运行已发布工作流，但没有验证到可修改线上工作流节点的公开应用 API。

因此网站实现分两层：

1. 必做：Excel 导入、任务管理、调用线上 Dify 工作流跑分、结果导出。
2. 可先实现本地管理：Prompt 和映射规则可编辑保存。
3. 线上注入：需要继续确认 Dify 管理端/Console API、管理员令牌或其他可写工作流接口。未确认前不能把“已成功注入线上节点”作为完成态。

## 后续要求

- Dify API Key 不得进入 Git。
- 服务端调用 Dify，前端不得直接持有 API Key。
- UI 上若提供注入按钮，必须区分“本地保存成功”和“线上注入成功/失败”。

