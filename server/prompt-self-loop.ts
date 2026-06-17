import { toCsv, type CompletedScoreRow } from './prompt-evaluation.js';
import type { CommentType, ScoreTask } from './shared/types.js';

type SampleSource = 'latest' | 'fallback';
type CommentTypeName = CommentType;

interface SourceRow extends CompletedScoreRow {
  sample_source: SampleSource;
}

export interface DiagnosticRow {
  task_id: string;
  task_name: string;
  sample_source: SampleSource;
  comment_type: string;
  comment_content: string;
  current_quality_score: number;
  current_quality_level: string;
  current_quality_reason: string;
  current_emotion_score: number;
  current_emotion_type: string;
  issue_type: string;
  platform_review: string;
  v3_target_quality_band: string;
  v3_target_emotion_type: string;
  prompt_rule_hint: string;
}

export interface SelfLoopArtifacts {
  snapshotMarkdown: string;
  typeStandardsMarkdown: string;
  diagnosticCsv: string;
  v3PromptsMarkdown: string;
  reviewMarkdown: string;
}

const commentTypes: CommentTypeName[] = ['书评', '章评', '段评'];

const diagnosticHeaders = [
  'task_id',
  'task_name',
  'sample_source',
  'comment_type',
  'comment_content',
  'current_quality_score',
  'current_quality_level',
  'current_quality_reason',
  'current_emotion_score',
  'current_emotion_type',
  'issue_type',
  'platform_review',
  'v3_target_quality_band',
  'v3_target_emotion_type',
  'prompt_rule_hint',
];

function taskTime(task: ScoreTask) {
  return new Date(task.createdAt).getTime() || 0;
}

export function selectLatestTask(tasks: ScoreTask[], taskId?: string) {
  const task = taskId
    ? tasks.find((item) => item.id === taskId)
    : [...tasks].sort((a, b) => taskTime(b) - taskTime(a))[0];
  if (!task) {
    throw new Error(taskId ? `未找到任务：${taskId}` : '没有可分析任务');
  }
  if (task.status === 'running') {
    throw new Error(`最新任务仍在运行：${task.id} / ${task.name}`);
  }
  return task;
}

function normalizeContent(value: string) {
  return value.trim().replace(/\s+/g, '');
}

function collectRowsFromTask(task: ScoreTask, sampleSource: SampleSource): SourceRow[] {
  return task.rows
    .filter((row) => row.status === 'completed' && row.result)
    .map((row) => ({
      task_id: task.id,
      task_name: task.name,
      row_id: row.id,
      row_number: row.rowNumber,
      comment_type: row.comment_type,
      comment_content: row.comment_content,
      quality_score: Number(row.result?.quality_score ?? 0),
      quality_level: row.result?.quality_level ?? '',
      quality_reason: row.result?.quality_reason ?? '',
      emotion_score: Number(row.result?.emotion_score ?? 0),
      emotion_type: row.result?.emotion_type ?? '',
      sample_source: sampleSource,
    }));
}

function dedupeRows(rows: SourceRow[]) {
  const selected = new Map<string, SourceRow>();
  for (const row of rows) {
    const key = `${row.comment_type}:${normalizeContent(row.comment_content)}`;
    if (!selected.has(key)) selected.set(key, row);
  }
  return [...selected.values()];
}

function buildDataset(latestTask: ScoreTask, tasks: ScoreTask[], minRowsPerType: number) {
  const latestRows = dedupeRows(collectRowsFromTask(latestTask, 'latest'));
  const selected = [...latestRows];
  const selectedKeys = new Set(selected.map((row) => `${row.comment_type}:${normalizeContent(row.comment_content)}`));
  const historyRows = dedupeRows(tasks
    .filter((task) => task.id !== latestTask.id)
    .flatMap((task) => collectRowsFromTask(task, 'fallback')));

  for (const type of commentTypes) {
    let count = selected.filter((row) => row.comment_type === type).length;
    for (const row of historyRows) {
      if (count >= minRowsPerType) break;
      const key = `${row.comment_type}:${normalizeContent(row.comment_content)}`;
      if (row.comment_type === type && !selectedKeys.has(key)) {
        selected.push(row);
        selectedKeys.add(key);
        count += 1;
      }
    }
  }

  return selected;
}

function isShortGeneric(row: SourceRow) {
  const text = normalizeContent(row.comment_content);
  return row.comment_type === '段评'
    && text.length <= 8
    && (/^(哈+|来[了啦]?|快|好|第一|cy|顶|爽|牛逼|笑|哭|打卡|👣|[!！。,.，]+)$/.test(text)
      || /^哈+[哈啊！!，,。.]*/.test(text));
}

function isOccupancy(row: SourceRow) {
  return row.comment_type === '章评'
    && /打卡|沙发|板凳|脚印|👣|第一|占楼/.test(row.comment_content);
}

function isBookMetadata(row: SourceRow) {
  const content = row.comment_content;
  return row.comment_type === '书评'
    && /书名|作者|标签|推荐指数|简介|一共描写/.test(content)
    && !/喜欢|不足|优点|缺点|节奏|人物|剧情|文笔|逻辑/.test(content.slice(-120));
}

function hasNegativeSignal(row: SourceRow) {
  return /垃圾|烂|无语|笑话|放.*屁|恶心|讨厌|失望|崩|bug|槽点|不行|离谱|蠢|傻|喷|骂|膈应|尴尬/.test(row.comment_content);
}

function isPotentialValuableShort(row: SourceRow) {
  const text = normalizeContent(row.comment_content);
  return row.comment_type === '段评'
    && text.length <= 16
    && row.quality_score < 70
    && /[？?]|不是|哪来|难说|孤独|狠人|算盘|神明|肉身|污渍|心/.test(text);
}

function diagnosticForRow(row: SourceRow): DiagnosticRow[] {
  const diagnostics: DiagnosticRow[] = [];
  const push = (
    issueType: string,
    platformReview: string,
    targetQuality: string,
    targetEmotion: string,
    promptRuleHint: string,
  ) => {
    diagnostics.push({
      task_id: row.task_id,
      task_name: row.task_name,
      sample_source: row.sample_source,
      comment_type: String(row.comment_type),
      comment_content: row.comment_content,
      current_quality_score: row.quality_score,
      current_quality_level: row.quality_level,
      current_quality_reason: row.quality_reason,
      current_emotion_score: row.emotion_score,
      current_emotion_type: row.emotion_type,
      issue_type: issueType,
      platform_review: platformReview,
      v3_target_quality_band: targetQuality,
      v3_target_emotion_type: targetEmotion,
      prompt_rule_hint: promptRuleHint,
    });
  };

  if (isShortGeneric(row) && row.quality_score >= 70) {
    push('段评短泛评高分', '短泛评可以表达情绪，但缺少明确对象和信息增量，不应进入高质量', '30-49 或 50-69', row.emotion_type || '按文本情绪判断', '段评短文本高分必须有明确对象、判断或高信息密度');
  }
  if (isOccupancy(row)) {
    push('章评占楼灌水', '占楼、打卡、脚印类内容不讨论章节，不提供社区阅读价值', '0-29', '中性', '章评必须围绕章节剧情、角色、节奏或伏笔展开');
  }
  if (isBookMetadata(row)) {
    push('书评元数据罗列', '书籍信息罗列不能替代阅读评价，缺少作品判断和推荐理由', '30-49', row.emotion_type || '中性', '书评高分需要作品整体判断、具体优缺点和阅读价值');
  }
  if (hasNegativeSignal(row) && row.emotion_score >= 70) {
    push('负向吐槽情绪偏高', '反问、粗口、吐槽和质疑表达的是负向或中性偏负，不应因互动感判正向', row.quality_score >= 70 ? '50-79 视信息量' : row.quality_level, '负向 或 中性', '情绪分只判断表达情绪，不受互动强度加成');
  }
  if (isPotentialValuableShort(row)) {
    push('优质短评误杀风险', '短评若包含具体疑问、判断或修辞张力，应保留中高分空间', '70-79', row.emotion_type || '按文本情绪判断', '段评不能按长度一刀切，关键看对象清楚和信息密度');
  }
  if (!diagnostics.length && row.sample_source === 'fallback') {
    push('历史补齐样本', '该样本用于补足最新任务中某类评论数量不足的问题，评分结论仅作辅助参考', qualityBin(row.quality_score), row.emotion_type || '按文本情绪判断', '正式结论优先采用 latest 样本，fallback 只补充分布覆盖');
  }

  return diagnostics;
}

export function createDiagnosticRows(latestTask: ScoreTask, tasks: ScoreTask[] = [], options: { minRowsPerType?: number } = {}) {
  const rows = buildDataset(latestTask, [latestTask, ...tasks], options.minRowsPerType ?? 60);
  return rows.flatMap(diagnosticForRow);
}

function qualityBin(score: number) {
  if (score < 30) return '0-29';
  if (score < 50) return '30-49';
  if (score < 70) return '50-69';
  if (score < 80) return '70-79';
  return '80-100';
}

function typeSummary(rows: SourceRow[]) {
  return commentTypes.map((type) => {
    const typedRows = rows.filter((row) => row.comment_type === type);
    const bins = { '0-29': 0, '30-49': 0, '50-69': 0, '70-79': 0, '80-100': 0 };
    for (const row of typedRows) bins[qualityBin(row.quality_score) as keyof typeof bins] += 1;
    return { type, rows: typedRows, bins };
  });
}

function renderSnapshot(latestTask: ScoreTask, rows: SourceRow[]) {
  const summaries = typeSummary(rows);
  return `# 最新任务 Prompt 自循环分析快照

生成时间：${new Date().toISOString()}

## 任务

- 任务 ID：${latestTask.id}
- 任务名：${latestTask.name}
- 状态：${latestTask.status}
- 总行数：${latestTask.totalRows}
- 成功行数：${latestTask.successRows}
- 失败行数：${latestTask.failedRows}
- 去重后分析样本：${rows.length}

## 类型分布

- ${summaries.map(({ type, rows: typedRows }) => `${type}：${typedRows.length}`).join('\n- ')}

| 类型 | 样本数 | 0-29 | 30-49 | 50-69 | 70-79 | 80-100 | 历史补齐 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${summaries.map(({ type, rows: typedRows, bins }) => `| ${type} | ${typedRows.length} | ${bins['0-29']} | ${bins['30-49']} | ${bins['50-69']} | ${bins['70-79']} | ${bins['80-100']} | ${typedRows.filter((row) => row.sample_source === 'fallback').length} |`).join('\n')}

## 使用原则

- 本轮正式分析优先使用最新任务样本
- 历史补齐样本只用于弥补某类评论数量不足，产物中会标记为 fallback
- 该快照不代表严格准确率，只用于发现误放、误杀和情绪误判模式
`;
}

function renderTypeStandards() {
  return `# 书评、章评、段评 V3 独立评分标准

## 书评评分标准

- 0-29：乱码、无意义、辱骂、人身攻击、纯短句泛评，无法提供作品判断
- 30-49：只有情绪宣泄、书籍元数据罗列、剧情简介堆砌，缺少有效评价
- 50-69：有明确阅读感受或单一优缺点，但分析较浅，结构和证据不足
- 70-79：能结合剧情、人物、文笔、节奏或推荐价值给出具体判断，表达较完整
- 80-100：多维评价清晰，优缺点或推荐理由充分，表达组织好，能给其他读者形成有效参考

## 章评评分标准

- 0-29：打卡、沙发、脚印、催更、纯表情、无关内容
- 30-49：简单复述章节信息或单点情绪反应，缺少具体观点
- 50-69：围绕章节剧情、角色行为或节奏表达有效反馈，但论证较少
- 70-79：能指出本章冲突、伏笔、角色动机、节奏变化或槽点，具备讨论价值
- 80-100：对章节推进有清晰洞察，能引发讨论，语言表达有张力且证据来自评论文本

## 段评评分标准

- 0-29：纯表情、cy、第一、脚印、无意义占位、乱码
- 30-49：哈哈、来了、快、好等短泛评，有情绪但缺少对象和信息增量
- 50-69：有明确情绪或对象，但只停留在轻量互动
- 70-79：短而具体，有明确对象、判断、疑问、梗点或信息增量
- 80-100：极高信息密度或文学性表达，短文本也能形成独立观点、修辞张力或强共鸣

## 情绪评分标准

- 0-29 负向：明确厌恶、质疑、反讽、粗口吐槽、失望、批评
- 30-79 中性：事实描述、轻微调侃、疑问、复杂混合情绪、情绪不明显
- 80-100 正向：明确喜欢、认可、兴奋、期待、感动、推荐
- 玩梗和互动感不自动等于正向，必须看评论主体语义
`;
}

function renderV3Prompts() {
  const outputSchema = `只输出严格 JSON，不要输出 Markdown，不要添加额外解释：\n{\n  "result": 0-100的整数,\n  "reason": "说明质量判断和主要证据，只能引用评论文本中的可见内容",\n  "emotion_score": 0-100的整数,\n  "version": "V3"\n}`;
  return `# V3 质量/情绪评分 Prompt

## 书评 Prompt

\`\`\`text
你是社区书评质量与情绪评分助手。只评估用户输入的书评文本本身，不假设书籍正文、章节内容或外部背景。

书评质量重点看：是否有作品整体判断、是否提到具体优缺点、是否能说明推荐或不推荐原因、表达是否完整有组织。书名、作者、标签、情节列表不能替代阅读评价。短句泛评、乱码、辱骂和纯情绪宣泄应低分。

质量分规则：
0-29：无效、乱码、辱骂、纯泛评
30-49：元数据罗列、简介堆砌、情绪宣泄，缺少实质评价
50-69：有阅读感受或单一判断，但分析浅
70-79：有具体优缺点和阅读价值判断
80-100：多维评价充分，表达清晰，能给其他读者形成参考

情绪分只判断评论表达的情绪，不参与质量分。负向吐槽、反讽和质疑不能判正向。

${outputSchema}
\`\`\`

## 章评 Prompt

\`\`\`text
你是社区章评质量与情绪评分助手。只评估用户输入的章评文本本身，不假设章节原文或小说上下文。

章评质量重点看：是否围绕本章剧情推进、角色行为、节奏、伏笔、冲突或槽点给出具体反馈。打卡、沙发、脚印、催更、纯表情、纯复述不能高分。夸张吐槽可以有质量，但必须能从文本中看出明确对象或判断。

质量分规则：
0-29：占楼、打卡、纯表情、无关内容
30-49：简单复述或泛泛情绪，没有章节讨论
50-69：有有效反馈，但只停留在单点感受
70-79：有明确剧情/角色/节奏判断，能引发讨论
80-100：对章节推进或角色动机有洞察，表达有张力且证据充分

情绪分只判断评论语义。调侃、反问、粗口吐槽通常是中性或负向，不因互动感强而判正向。

${outputSchema}
\`\`\`

## 段评 Prompt

\`\`\`text
你是社区段评质量与情绪评分助手。只评估用户输入的段评文本本身，不假设段落原文或上下文。

段评可以很短，但高质量必须短而具体：有明确对象、判断、疑问、梗点、修辞张力或信息增量。纯表情、cy、第一、哈哈、来了、快、好、爽等短泛评只能表达情绪，默认不能进入高质量。不要因为互动感、热闹感或情绪强烈就给高质量。

质量分规则：
0-29：纯表情、占位、乱码、无意义
30-49：短泛评或到场式互动，只有情绪没有对象
50-69：有对象或情绪，但信息增量有限
70-79：短而具体，有明确判断、疑问、调侃对象或梗点
80-100：信息密度很高或有文学性、洞察力、强修辞张力

情绪分只判断表达情绪。反讽、质疑、吐槽、粗口默认不是正向；玩梗需结合主体语义判断。

${outputSchema}
\`\`\`
`;
}

function renderReview(rows: SourceRow[], diagnostics: DiagnosticRow[]) {
  const issueCounts = diagnostics.reduce<Record<string, number>>((acc, row) => {
    acc[row.issue_type] = (acc[row.issue_type] ?? 0) + 1;
    return acc;
  }, {});
  return `# V1 到 V3 预期改进结论

## 数据依据

- 分析样本数：${rows.length}
- 诊断样本数：${diagnostics.length}
- 样本来源：最新任务为主，必要时历史补齐

## 主要问题

${Object.entries(issueCounts).map(([issue, count]) => `- ${issue}：${count}`).join('\n') || '- 当前诊断规则未命中明显问题'}

## V3 预期改进

- 书评：降低书籍信息罗列、情绪宣泄、短泛评的误放
- 章评：降低打卡、占楼、脚印、催更和纯复述的误放
- 段评：降低短泛评高分，保留有明确对象和信息密度的高价值短评
- 情绪：反讽、质疑、吐槽、粗口不再因互动感强被判正向

## 准确率说明

- 本轮没有人工逐条标注，不能声称严格准确率
- 该结论是基于平台视角规则和已跑样本的无监督诊断
- 后续若要上线 V3，应使用同一批回归样本对 V1/V3 实跑结果做差异复核
`;
}

export function buildSelfLoopArtifacts(
  tasks: ScoreTask[],
  options: { taskId?: string; minRowsPerType?: number } = {},
): SelfLoopArtifacts {
  const latestTask = selectLatestTask(tasks, options.taskId);
  const rows = buildDataset(latestTask, tasks, options.minRowsPerType ?? 60);
  const diagnostics = rows.flatMap(diagnosticForRow);
  return {
    snapshotMarkdown: renderSnapshot(latestTask, rows),
    typeStandardsMarkdown: renderTypeStandards(),
    diagnosticCsv: `${toCsv(diagnostics as unknown as Array<Record<string, unknown>>, diagnosticHeaders)}\n`,
    v3PromptsMarkdown: renderV3Prompts(),
    reviewMarkdown: renderReview(rows, diagnostics),
  };
}
