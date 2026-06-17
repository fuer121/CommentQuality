import { toCsv } from './prompt-evaluation.js';
import type { DiagnosticRow } from './prompt-self-loop.js';

export type ReplayOutcome = 'expected_downscore' | 'expected_emotion_fix' | 'guardrail_keep_quality' | 'review_only';

export interface ReplayRow extends DiagnosticRow {
  replay_outcome: ReplayOutcome;
}

export interface V3ReplayArtifacts {
  markdown: string;
  csv: string;
}

const replayHeaders = [
  'task_id',
  'task_name',
  'sample_source',
  'comment_type',
  'comment_content',
  'current_quality_score',
  'current_quality_level',
  'current_emotion_score',
  'current_emotion_type',
  'issue_type',
  'replay_outcome',
  'platform_review',
  'v3_target_quality_band',
  'v3_target_emotion_type',
  'prompt_rule_hint',
];

export function classifyReplayOutcome(row: DiagnosticRow): ReplayOutcome {
  if (row.issue_type === '优质短评误杀风险') return 'guardrail_keep_quality';
  if (row.issue_type === '负向吐槽情绪偏高') return 'expected_emotion_fix';
  if (row.issue_type.includes('高分') || row.issue_type.includes('灌水') || row.issue_type.includes('罗列')) {
    return 'expected_downscore';
  }
  return 'review_only';
}

export function selectReplayRows(rows: DiagnosticRow[], options: { perIssueLimit?: number } = {}) {
  const perIssueLimit = options.perIssueLimit ?? 8;
  const counts = new Map<string, number>();
  const selected: DiagnosticRow[] = [];
  for (const row of rows) {
    const count = counts.get(row.issue_type) ?? 0;
    if (count >= perIssueLimit) continue;
    counts.set(row.issue_type, count + 1);
    selected.push(row);
  }
  return selected;
}

function withOutcome(rows: DiagnosticRow[]): ReplayRow[] {
  return rows.map((row) => ({
    ...row,
    replay_outcome: classifyReplayOutcome(row),
  }));
}

function countBy<T extends string>(rows: ReplayRow[], getKey: (row: ReplayRow) => T) {
  return rows.reduce<Record<T, number>>((acc, row) => {
    const key = getKey(row);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<T, number>);
}

function renderMarkdown(rows: ReplayRow[]) {
  const byOutcome = countBy(rows, (row) => row.replay_outcome);
  const byType = countBy(rows, (row) => String(row.comment_type));
  return `# V3 小样本回放验证

生成时间：${new Date().toISOString()}

## 验证性质

- 本报告是离线候选回放，尚未调用线上 V3 工作流
- 当前线上工作流仍固定运行 V1，V3 Prompt 还未接入线上路由
- 回放依据来自 \`diagnostic-samples.csv\` 的平台视角诊断和 V3 目标规则

## 样本概况

- 回放样本数：${rows.length}
- 按类型：${Object.entries(byType).map(([key, value]) => `${key} ${value}`).join('，') || '无'}
- 按结果：${Object.entries(byOutcome).map(([key, value]) => `${key} ${value}`).join('，') || '无'}

## 结果解读

- expected_downscore：V3 应降低低信息量、灌水或元数据罗列内容的质量分
- expected_emotion_fix：V3 应修正负向吐槽、反问、粗口被判正向的问题
- guardrail_keep_quality：V3 应保留有明确对象、疑问、判断或修辞张力的短评质量空间
- review_only：仅作为人工复核样本，不直接定义升降分目标

## 代表样本

| 类型 | 问题 | 当前质量 | 当前情绪 | V3 目标质量 | V3 目标情绪 | 回放结论 | 评论 |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
${rows.slice(0, 20).map((row) => `| ${row.comment_type} | ${row.issue_type} | ${row.current_quality_score} | ${row.current_emotion_score} | ${row.v3_target_quality_band} | ${row.v3_target_emotion_type} | ${row.replay_outcome} | ${row.comment_content.replace(/\|/g, '/').slice(0, 80)} |`).join('\n')}

## 下一步

- 将 V3 Prompt 接入工作流版本路由后，用同一批样本跑真实 V3
- 对比真实 V3 输出与本报告的目标结论
- 重点检查 expected_downscore 是否下降，guardrail_keep_quality 是否没有被误杀
`;
}

export function buildV3ReplayArtifacts(rows: DiagnosticRow[], options: { perIssueLimit?: number } = {}): V3ReplayArtifacts {
  const selected = withOutcome(selectReplayRows(rows, options));
  return {
    markdown: renderMarkdown(selected),
    csv: `${toCsv(selected as unknown as Array<Record<string, unknown>>, replayHeaders)}\n`,
  };
}
