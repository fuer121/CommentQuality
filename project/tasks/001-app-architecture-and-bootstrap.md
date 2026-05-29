# 001 网站架构与工程初始化

状态：待开始

## 目标

在当前项目目录内建立一个可运行的网站工程，用于后续实现评论导入和跑分。

## 输入文件

- `project/README.md`
- `project/BASELINE.md`
- `project/CONTROL.md`
- `project/GIT_POLICY.md`
- `dify 工作流/社区评论质量评分-书章段评版.yml`

## 待决策

- 技术栈：优先考虑 Vite + React + TypeScript + Node/Express，除非本地已有更适合的工程约束。
- 导入格式：MVP 是否先支持 CSV，还是同时支持 XLSX。
- 持久化：MVP 使用本地 JSON 文件还是 SQLite。

## 初始任务

- 写入技术栈决策到 `project/DECISIONS.md`。
- 创建 `.gitignore` 和 `.env.example`。
- 初始化网站工程。
- 实现首页骨架和健康检查接口。
- 启动本地服务并验证可访问。

## 验收标准

- 本地开发命令可运行。
- 浏览器可打开网站首页。
- 健康检查接口返回服务状态和 Dify 配置状态，不泄露密钥。
- 项目目录无明显应忽略文件进入候选提交范围。

## 子 Agent 建议

本阶段默认不拆子 Agent。若初始化后同时需要前端骨架和服务端健康检查，可拆成两个短任务，但必须先写任务文件。

