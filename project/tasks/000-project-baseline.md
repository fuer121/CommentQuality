# 000 项目基线

状态：已完成

## 目标

建立项目唯一真实信源和总控机制，为后续网站实现、子 Agent 协作、Git 操作和经验沉淀提供基线。

## 范围

本任务只建立项目控制面，不实现网站功能。

## 产物

- `project/README.md`
- `project/BASELINE.md`
- `project/CONTROL.md`
- `project/TASKS.md`
- `project/AGENT_PROTOCOL.md`
- `project/GIT_POLICY.md`
- `project/DECISIONS.md`
- `project/knowledge/LESSONS.md`

## 验收记录

- 已确认当前目录不是 Git 仓库。
- 已确认当前可用工作流为 `dify 工作流/社区评论质量评分-书章段评版.yml`。
- 已记录输入契约：评论类型、评论内容。
- 已记录输出契约：`comment_type`、`quality_score`、`quality_level`、`quality_reason`、`emotion_score`、`emotion_type`。
- 已记录总控、子 Agent、Git、经验沉淀规则。

## 总控判断

阶段 0 可以关闭。下一阶段进入网站架构与工程初始化。

