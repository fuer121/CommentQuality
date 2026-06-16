import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  collectCompletedRows,
  createLabelingSample,
  regressionContents,
  summarizePromptAccuracy,
  toCsv,
  toLabelingRows,
  toRegressionTargetRows,
} from '../server/prompt-evaluation.js';
import { defaultConfig } from '../server/storage.js';
import type { ScoreTask } from '../server/shared/types.js';

const outputDir = path.resolve('project/prompt-optimization');

const labelingHeaders = [
  'task_id',
  'task_name',
  'row_id',
  'row_number',
  'comment_type',
  'comment_content',
  'v1_quality_score',
  'v1_quality_level',
  'v1_quality_reason',
  'v1_emotion_score',
  'v1_emotion_type',
  'expected_quality_level',
  'expected_quality_score_band',
  'expected_emotion_type',
  'error_type',
  'label_reason',
];

const regressionHeaders = [
  'comment_content',
  'found_in_v1_results',
  'comment_type',
  'v1_quality_score',
  'v1_quality_level',
  'v1_emotion_score',
  'v1_emotion_type',
  'v2_target_quality',
  'v2_target_emotion',
  'optimization_note',
];

function percent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function renderTypeSummary(summary: ReturnType<typeof summarizePromptAccuracy>) {
  return Object.entries(summary.byType)
    .map(([type, item]) => `| ${type} | ${item.count} | ${item.averageQuality} | ${item.medianQuality} | ${item.qualityBins['0-29']} | ${item.qualityBins['30-49']} | ${item.qualityBins['50-69']} | ${item.qualityBins['70-79']} | ${item.qualityBins['80-100']} |`)
    .join('\n');
}

function renderReport(summary: ReturnType<typeof summarizePromptAccuracy>, sampleSize: number) {
  return `# 质量/情绪评分 Prompt 准确度结论

生成时间：${new Date().toISOString()}

## 结论

- 当前不能计算严格准确率，因为本地结果没有人工标注字段
- 无监督审计结论：当前 V1 Prompt 存在系统性误放，主要集中在段评短泛评
- 本轮优化目标应优先降低“差/中评论被判好”的误放率，再评估是否产生高价值短评误杀
- V2 Prompt 已按“只看评论文本本身、短泛评上限、质量和情绪解耦、禁止补脑上下文”重写

## 样本概况

- 已完成跑分结果：${summary.totalCompletedRows}
- 人工标注抽样：${sampleSize}
- 回归样本：${regressionContents.length}

## 按评论类型分布

| 类型 | 数量 | 平均质量分 | 中位质量分 | 0-29 | 30-49 | 50-69 | 70-79 | 80-100 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${renderTypeSummary(summary)}

## 主要风险指标

- 段评 3 字以内且质量分 >=70：${summary.shortParagraphStats.max3.highQuality}/${summary.shortParagraphStats.max3.total}，占 ${percent(summary.shortParagraphStats.max3.highQualityRate)}
- 段评 6 字以内且质量分 >=70：${summary.shortParagraphStats.max6.highQuality}/${summary.shortParagraphStats.max6.total}，占 ${percent(summary.shortParagraphStats.max6.highQualityRate)}
- 泛化短评且质量分 >=70：${summary.genericShortStats.highQuality}/${summary.genericShortStats.total}，占 ${percent(summary.genericShortStats.highQualityRate)}
- 情绪启发式疑似问题：${summary.heuristicEmotionIssueCount}

## 准确度判断

- 严格准确率：不可计算
- 当前可判断的问题：质量分偏宽，段评短评论高分比例异常，情绪分会把吐槽、反问、调侃误判为正向
- 标注完成后的验收口径：quality_level 一致率目标 >=75%，emotion_type 一致率目标 >=80%，并单独统计误放率与误杀率

## 后续执行

- 先在 \`labeling-sample.csv\` 填写人工标注字段
- 使用 \`regression-samples.csv\` 检查已发现异常样本
- 使用 \`v1-v2-difference-samples.csv\` 查看 V1 当前结果与 V2 目标口径差异
- 导入 \`社区评论质量评分-书章段评版-prompt-version.yml\` 后，用 V1 和 V2 分别跑同一批标注样本
- 对比 V1/V2 后再决定是否把前端默认跑分版本从 V1 切到 V2
`;
}

function renderPrompts() {
  const prompts = defaultConfig.promptVersions.V2;
  return `# V2 质量/情绪评分 Prompt

## 书评 Prompt

\`\`\`text
${prompts.bookReview.trim()}
\`\`\`

## 章评 Prompt

\`\`\`text
${prompts.chapterComment.trim()}
\`\`\`

## 段评 Prompt

\`\`\`text
${prompts.paragraphComment.trim()}
\`\`\`
`;
}

async function main() {
  const raw = await fs.readFile(path.resolve('data/tasks.json'), 'utf8');
  const tasks = JSON.parse(raw) as ScoreTask[];
  const completedRows = collectCompletedRows(tasks);
  const summary = summarizePromptAccuracy(completedRows);
  const sample = createLabelingSample(completedRows, { sampleSize: 180 });

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'accuracy-conclusion.md'), renderReport(summary, sample.length), 'utf8');
  await fs.writeFile(path.join(outputDir, 'labeling-sample.csv'), `${toCsv(toLabelingRows(sample), labelingHeaders)}\n`, 'utf8');
  const regressionCsv = `${toCsv(toRegressionTargetRows(completedRows), regressionHeaders)}\n`;
  await fs.writeFile(path.join(outputDir, 'regression-samples.csv'), regressionCsv, 'utf8');
  await fs.writeFile(path.join(outputDir, 'v1-v2-difference-samples.csv'), regressionCsv, 'utf8');
  await fs.writeFile(path.join(outputDir, 'v2-prompts.md'), renderPrompts(), 'utf8');

  console.log(`Wrote prompt optimization artifacts to ${outputDir}`);
}

await main();
