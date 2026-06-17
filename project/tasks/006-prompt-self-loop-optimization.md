# 006 Prompt 自循环优化

状态：已完成，V3 Prompt 为离线候选

## 目标

基于最新完成任务 `bnx2KtM1ia / 评论打分测试02` 的已跑结果，自动分析书评、章评、段评的质量与情绪评分问题，沉淀各类型独立评分标准，并输出 V3 Prompt 候选

## 数据快照

- 最新任务：`评论打分测试02`
- 任务 ID：`bnx2KtM1ia`
- 任务状态：completed
- 总行数：606
- 成功行数：606
- 失败行数：0
- 去重后分析样本：588
- 书评：129
- 章评：71
- 段评：388

## 已产出文件

- `project/prompt-optimization/self-loop/latest-task-snapshot.md`
- `project/prompt-optimization/self-loop/type-standards.md`
- `project/prompt-optimization/self-loop/diagnostic-samples.csv`
- `project/prompt-optimization/self-loop/v3-prompts.md`
- `project/prompt-optimization/self-loop/v1-v3-review.md`

## 实现变更

- 新增 `server/prompt-self-loop.ts`，提供最新任务选择、完成状态校验、样本补齐、诊断分类和产物渲染能力
- 新增 `server/prompt-self-loop.test.ts`，覆盖最新任务运行中阻断、fallback 来源标记、V3 输出格式和类型标准生成
- 新增 `scripts/build-prompt-self-loop-artifacts.ts`，支持从 `data/tasks.json` 生成可复跑产物
- 新增 npm 命令 `build:prompt-self-loop`

## 主要诊断结论

- 书评需要区别完整阅读评价和书籍元数据/简介罗列
- 章评需要区别章节讨论和打卡、占楼、脚印类灌水
- 段评允许短，但高质量必须有明确对象、判断、梗点、疑问或信息增量
- 情绪分需要把互动感和正向情绪拆开，反讽、质疑、粗口吐槽不能默认判正向

## 验证记录

- `node --import tsx --test --test-concurrency=1 server/prompt-self-loop.test.ts`：通过
- `npm run build:prompt-self-loop -- --task-id bnx2KtM1ia`：通过
- 产物抽查：快照命中最新任务，诊断样本 37 条，书评 13 条、章评 5 条、段评 19 条
- 敏感信息检查：自循环产物未发现 API Key 或 Bearer Token
