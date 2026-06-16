# 004 质量/情绪评分 Prompt 优化

状态：V2 Prompt 与离线评估产物已实现，严格准确率待人工标注后计算

## 目标

基于本地已跑评论结果，分析当前质量/情绪评分 Prompt 的准确性问题，建立人工标注样本，输出 V2 Prompt，并支持在本地网站中切换 V1/V2 跑分版本

## 成功标准

- 输出当前 V1 的准确度结论报告
- 建立 150-200 条人工标注样本
- 输出已发现异常样本的 V1 vs V2 差异表
- 输出最终 V2 书评、章评、段评 Prompt
- `prompt-version` 工作流 YAML 中 V1 保持不变，V2 节点写入新 Prompt
- 前端 Prompt 管理支持 V1/V2 切换
- 后端在选择 V2 时向 Dify 输入 `prompt_version: V2`
- 保持原输出契约不变

## 当前准确度结论

- 严格准确率暂不可计算，因为本地跑分结果没有人工标注字段
- 无监督审计显示当前 V1 存在系统性误放，主要集中在段评短泛评
- 已完成跑分结果共 2511 条，其中段评 2156 条
- 段评 3 字以内且质量分 >=70 占 31.3%
- 段评 6 字以内且质量分 >=70 占 47.6%
- V1 会把“爽”“哈哈”“来了”“快”“牛逼”等短泛评打到 75-85
- V1 会在理由中补足未输入的上下文，例如声称“贴合段落”或“准确抓住情节”
- V1 情绪分会把部分反问、吐槽和质疑误判为正向

## 已产出文件

- `project/prompt-optimization/accuracy-conclusion.md`
- `project/prompt-optimization/labeling-sample.csv`
- `project/prompt-optimization/regression-samples.csv`
- `project/prompt-optimization/v1-v2-difference-samples.csv`
- `project/prompt-optimization/v2-prompts.md`
- `dify 工作流/社区评论质量评分-书章段评版-prompt-version.yml`

## 实现变更

- 新增 `server/prompt-evaluation.ts`，提供已完成结果聚合、无监督诊断、标注样本抽取和 CSV 输出能力
- 新增 `scripts/build-prompt-optimization-artifacts.ts`，可复跑生成 Prompt 优化产物
- 扩展 `AppConfig`，新增 `promptVersion` 与 `promptVersions.V1/V2`
- 默认跑分版本保持 V1，避免影响当前线上工作流
- 当配置选择 V2 时，后端跑分输入会追加 `prompt_version: V2`
- 前端 Prompt 管理新增“当前跑分版本”选择器，并编辑当前版本 Prompt
- 前端运行中任务轮询不再刷新 `/api/config`，避免覆盖未保存的 Prompt 版本切换或编辑
- `prompt-version` 工作流 YAML 的 V2 LLM 节点已写入误放收紧版 Prompt

## 验证记录

- `node --import tsx --test --test-concurrency=1 server/prompt-evaluation.test.ts`：通过
- `npm test`：通过
- `npm run typecheck`：通过
- `npm run build`：通过
- `npm run build:prompt-artifacts`：通过，生成 4 类 Prompt 优化产物
- Ruby YAML 解析验证：V1 节点仍存在，V2 书评/章评/段评节点均包含 `【Prompt 版本】V2`
- in-app Browser 验证：页面出现 V1/V2 选择器，默认值为 V1，切换 V2 后书评 Prompt 显示 `【Prompt 版本】V2`，任务列表正常展示，浏览器控制台无 error/warn
- in-app Browser 后续 reload 验证被 Browser URL policy 拒绝，未绕过该策略

## 未决事项

- 当前 Dify App API 仍不支持线上节点写入，V2 需要通过导入 `prompt-version` YAML 或获取 Console/管理端写权限后上线
- 严格准确率需要先完成 `labeling-sample.csv` 的人工标注，再用同一批样本跑 V1/V2 对比
- 当前 V2 差异表中的 V2 目标口径是评估目标，不是线上 V2 实跑结果
