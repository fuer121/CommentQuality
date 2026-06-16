import type { CommentType, ScoreTask } from './shared/types.js';

export const regressionContents = [
  '爽',
  '哈哈',
  '来了',
  '快',
  '牛逼',
  '仙帝？简直是一个笑话',
  '前面不是已经放松警惕了吗？这还放松个屁',
];

const genericShortComments = new Set([
  '爽',
  '哈哈',
  '哈哈哈',
  '来了',
  '来啦',
  '快',
  '快点',
  '牛逼',
  '666',
  '好',
  '顶',
  '哭',
  '笑',
]);

export interface CompletedScoreRow {
  task_id: string;
  task_name: string;
  row_id: string;
  row_number: number;
  comment_type: CommentType | string;
  comment_content: string;
  quality_score: number;
  quality_level: string;
  quality_reason: string;
  emotion_score: number;
  emotion_type: string;
}

interface TypeSummary {
  count: number;
  averageQuality: number;
  medianQuality: number;
  qualityBins: Record<'0-29' | '30-49' | '50-69' | '70-79' | '80-100', number>;
}

interface RateSummary {
  total: number;
  highQuality: number;
  highQualityRate: number;
}

export interface PromptAccuracySummary {
  strictAccuracyAvailable: false;
  totalCompletedRows: number;
  byType: Record<string, TypeSummary>;
  shortParagraphStats: {
    max3: RateSummary;
    max6: RateSummary;
  };
  genericShortStats: RateSummary;
  heuristicEmotionIssueCount: number;
}

export function collectCompletedRows(tasks: ScoreTask[]): CompletedScoreRow[] {
  return tasks.flatMap((task) => task.rows
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
    })));
}

function qualityBin(score: number): keyof TypeSummary['qualityBins'] {
  if (score < 30) return '0-29';
  if (score < 50) return '30-49';
  if (score < 70) return '50-69';
  if (score < 80) return '70-79';
  return '80-100';
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : round((sorted[middle - 1] + sorted[middle]) / 2);
}

function rate(rows: CompletedScoreRow[]) {
  const highQuality = rows.filter((row) => row.quality_score >= 70).length;
  return {
    total: rows.length,
    highQuality,
    highQualityRate: rows.length ? round(highQuality / rows.length, 3) : 0,
  };
}

function normalizeContent(value: string) {
  return value.trim().replace(/\s+/g, '');
}

function hasHeuristicEmotionIssue(row: CompletedScoreRow) {
  const content = row.comment_content;
  const negativePattern = /垃圾|烂|无语|笑话|放.*屁|恶心|讨厌|失望|崩|bug|槽点|不行|离谱|蠢|傻|喷|骂/;
  const positivePattern = /喜欢|好看|精彩|绝了|感动|期待|推荐|爽|牛逼|开心|赞/;
  return (negativePattern.test(content) && row.emotion_score >= 80)
    || (positivePattern.test(content) && row.emotion_score <= 29);
}

export function summarizePromptAccuracy(rows: CompletedScoreRow[]): PromptAccuracySummary {
  const byType: PromptAccuracySummary['byType'] = {};
  for (const row of rows) {
    const key = String(row.comment_type || '未知');
    byType[key] ??= {
      count: 0,
      averageQuality: 0,
      medianQuality: 0,
      qualityBins: { '0-29': 0, '30-49': 0, '50-69': 0, '70-79': 0, '80-100': 0 },
    };
    byType[key].count += 1;
    byType[key].qualityBins[qualityBin(row.quality_score)] += 1;
  }

  for (const [type, summary] of Object.entries(byType)) {
    const values = rows.filter((row) => String(row.comment_type || '未知') === type).map((row) => row.quality_score);
    summary.averageQuality = round(values.reduce((sum, score) => sum + score, 0) / values.length);
    summary.medianQuality = median(values);
  }

  const paragraphRows = rows.filter((row) => row.comment_type === '段评');
  const max3 = paragraphRows.filter((row) => normalizeContent(row.comment_content).length <= 3);
  const max6 = paragraphRows.filter((row) => normalizeContent(row.comment_content).length <= 6);
  const genericShortRows = rows.filter((row) => genericShortComments.has(normalizeContent(row.comment_content)));

  return {
    strictAccuracyAvailable: false,
    totalCompletedRows: rows.length,
    byType,
    shortParagraphStats: {
      max3: rate(max3),
      max6: rate(max6),
    },
    genericShortStats: rate(genericShortRows),
    heuristicEmotionIssueCount: rows.filter(hasHeuristicEmotionIssue).length,
  };
}

function stratumKey(row: CompletedScoreRow) {
  const length = normalizeContent(row.comment_content).length;
  const lengthBucket = length <= 6 ? 'short' : length <= 30 ? 'medium' : 'long';
  return `${row.comment_type}:${qualityBin(row.quality_score)}:${lengthBucket}:${row.emotion_type}`;
}

export function createLabelingSample(
  rows: CompletedScoreRow[],
  options: { sampleSize?: number; mandatoryContents?: string[] } = {},
) {
  const sampleSize = options.sampleSize ?? 180;
  const mandatoryContents = options.mandatoryContents ?? regressionContents;
  const selected = new Map<string, CompletedScoreRow>();

  for (const content of mandatoryContents) {
    const row = rows.find((item) => item.comment_content === content);
    if (row) selected.set(row.row_id, row);
    if (selected.size >= sampleSize) return [...selected.values()];
  }

  const buckets = new Map<string, CompletedScoreRow[]>();
  for (const row of rows) {
    const key = stratumKey(row);
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }

  const sortedBuckets = [...buckets.values()].sort((a, b) => b.length - a.length);
  let cursor = 0;
  while (selected.size < sampleSize && sortedBuckets.some((bucket) => bucket.length > cursor)) {
    for (const bucket of sortedBuckets) {
      const row = bucket[cursor];
      if (row && !selected.has(row.row_id)) selected.set(row.row_id, row);
      if (selected.size >= sampleSize) break;
    }
    cursor += 1;
  }

  return [...selected.values()];
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: Array<Record<string, unknown>>, headers: string[]) {
  return [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n');
}

export function toLabelingRows(rows: CompletedScoreRow[]) {
  return rows.map((row) => ({
    task_id: row.task_id,
    task_name: row.task_name,
    row_id: row.row_id,
    row_number: row.row_number,
    comment_type: row.comment_type,
    comment_content: row.comment_content,
    v1_quality_score: row.quality_score,
    v1_quality_level: row.quality_level,
    v1_quality_reason: row.quality_reason,
    v1_emotion_score: row.emotion_score,
    v1_emotion_type: row.emotion_type,
    expected_quality_level: '',
    expected_quality_score_band: '',
    expected_emotion_type: '',
    error_type: '',
    label_reason: '',
  }));
}

export function toRegressionTargetRows(rows: CompletedScoreRow[]) {
  const targets: Record<string, { quality: string; emotion: string; note: string }> = {
    爽: { quality: '30-49 / 差', emotion: '80-100 / 正向', note: '短泛评，有正向情绪但缺少对象和信息增量' },
    哈哈: { quality: '30-49 / 差', emotion: '80-100 / 正向', note: '短泛评，不能仅因互动感给高质量' },
    来了: { quality: '30-49 / 差', emotion: '60-79 / 中性', note: '到场式评论，质量默认上限应收紧' },
    快: { quality: '30-49 / 差', emotion: '60-79 / 中性', note: '催促式短评，缺少明确对象和理由' },
    牛逼: { quality: '30-49 / 差', emotion: '80-100 / 正向', note: '强情绪认可但质量信息不足' },
    '仙帝？简直是一个笑话': { quality: '50-69 / 中', emotion: '0-29 / 负向', note: '有明确对象和否定判断，但分析仍较浅' },
    '前面不是已经放松警惕了吗？这还放松个屁': { quality: '70-79 / 中', emotion: '0-29 / 负向', note: '有具体逻辑质疑，情绪应判负向' },
  };

  return regressionContents.map((content) => {
    const row = rows.find((item) => item.comment_content === content);
    const target = targets[content];
    return {
      comment_content: content,
      found_in_v1_results: Boolean(row),
      comment_type: row?.comment_type ?? '',
      v1_quality_score: row?.quality_score ?? '',
      v1_quality_level: row?.quality_level ?? '',
      v1_emotion_score: row?.emotion_score ?? '',
      v1_emotion_type: row?.emotion_type ?? '',
      v2_target_quality: target.quality,
      v2_target_emotion: target.emotion,
      optimization_note: target.note,
    };
  });
}
