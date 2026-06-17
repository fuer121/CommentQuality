import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSelfLoopArtifacts,
  createDiagnosticRows,
  selectLatestTask,
} from './prompt-self-loop.js';
import type { ScoreTask, TaskRow } from './shared/types.js';

function row(
  id: string,
  type: string,
  content: string,
  qualityScore: number,
  emotionScore: number,
  reason = '测试理由',
): TaskRow {
  return {
    id,
    rowNumber: Number(id.replace(/\D/g, '')) || 2,
    comment_type: type,
    comment_content: content,
    status: 'completed',
    result: {
      comment_type: type,
      quality_score: qualityScore,
      quality_level: qualityScore >= 80 ? '好' : qualityScore >= 30 ? '中' : '差',
      quality_reason: reason,
      emotion_score: emotionScore,
      emotion_type: emotionScore >= 80 ? '正向' : emotionScore >= 30 ? '中性' : '负向',
    },
  };
}

function task(id: string, createdAt: string, status: ScoreTask['status'], rows: TaskRow[]): ScoreTask {
  return {
    id,
    name: `任务 ${id}`,
    fileName: `${id}.xlsx`,
    status,
    totalRows: rows.length,
    validRows: rows.length,
    successRows: rows.length,
    failedRows: 0,
    createdAt,
    updatedAt: createdAt,
    rows,
  };
}

test('selectLatestTask rejects a running latest task before generating formal artifacts', () => {
  const tasks = [
    task('new', '2026-06-16T13:21:38.164Z', 'running', []),
    task('old', '2026-06-16T12:21:38.164Z', 'completed', []),
  ];

  assert.throws(
    () => selectLatestTask(tasks),
    /最新任务仍在运行/,
  );
});

test('diagnostic rows mark issue types and keep sample source', () => {
  const latest = task('latest', '2026-06-16T13:21:38.164Z', 'completed', [
    row('r1', '段评', '哈哈', 85, 92),
    row('r2', '章评', '打卡', 10, 50),
    row('r3', '书评', '书名《测试》\n作者: 某某\n标签【快穿】', 45, 60),
    row('r4', '段评', '前面不是已经放松警惕了吗？这还放松个屁', 82, 88),
  ]);
  const rows = createDiagnosticRows(latest, []);

  assert.ok(rows.some((item) => item.issue_type === '段评短泛评高分' && item.sample_source === 'latest'));
  assert.ok(rows.some((item) => item.issue_type === '章评占楼灌水' && item.sample_source === 'latest'));
  assert.ok(rows.some((item) => item.issue_type === '书评元数据罗列' && item.sample_source === 'latest'));
  assert.ok(rows.some((item) => item.issue_type === '负向吐槽情绪偏高' && item.sample_source === 'latest'));
});

test('self-loop artifacts use latest task first and mark fallback rows when a type is insufficient', () => {
  const latest = task('latest', '2026-06-16T13:21:38.164Z', 'completed', [
    row('r1', '书评', '具体优点和缺点都讲到了', 75, 60),
    row('r2', '章评', '打卡', 10, 50),
  ]);
  const history = task('history', '2026-06-15T13:21:38.164Z', 'completed', [
    row('r3', '段评', '哪来的一万', 75, 55),
  ]);

  const artifacts = buildSelfLoopArtifacts([latest, history], { minRowsPerType: 1 });

  assert.match(artifacts.snapshotMarkdown, /latest/);
  assert.match(artifacts.snapshotMarkdown, /书评：1/);
  assert.match(artifacts.diagnosticCsv, /sample_source/);
  assert.match(artifacts.diagnosticCsv, /fallback/);
  assert.match(artifacts.v3PromptsMarkdown, /"result"/);
  assert.match(artifacts.v3PromptsMarkdown, /"reason"/);
  assert.match(artifacts.v3PromptsMarkdown, /"emotion_score"/);
  assert.match(artifacts.v3PromptsMarkdown, /"version"/);
  assert.match(artifacts.typeStandardsMarkdown, /书评评分标准/);
  assert.match(artifacts.typeStandardsMarkdown, /章评评分标准/);
  assert.match(artifacts.typeStandardsMarkdown, /段评评分标准/);
});
