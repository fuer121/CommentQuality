import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectCompletedRows,
  createLabelingSample,
  summarizePromptAccuracy,
} from './prompt-evaluation.js';
import type { ScoreTask } from './shared/types.js';

function task(rows: ScoreTask['rows']): ScoreTask {
  return {
    id: 'task-1',
    name: '样本任务',
    fileName: 'comments.xlsx',
    status: 'completed',
    totalRows: rows.length,
    validRows: rows.length,
    successRows: rows.filter((row) => row.status === 'completed').length,
    failedRows: 0,
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedAt: '2026-06-16T00:00:00.000Z',
    rows,
  };
}

test('collectCompletedRows keeps only rows with scoring results', () => {
  const rows = collectCompletedRows([
    task([
      {
        id: 'row-1',
        rowNumber: 2,
        comment_type: '段评',
        comment_content: '爽',
        status: 'completed',
        result: {
          comment_type: '段评',
          quality_score: 85,
          quality_level: '好',
          quality_reason: '测试理由',
          emotion_score: 95,
          emotion_type: '正向',
        },
      },
      {
        id: 'row-2',
        rowNumber: 3,
        comment_type: '段评',
        comment_content: '待跑分',
        status: 'pending',
      },
    ]),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].comment_content, '爽');
});

test('createLabelingSample includes mandatory regression comments before filling strata', () => {
  const completedRows = collectCompletedRows([
    task([
      {
        id: 'row-1',
        rowNumber: 2,
        comment_type: '段评',
        comment_content: '爽',
        status: 'completed',
        result: {
          comment_type: '段评',
          quality_score: 85,
          quality_level: '好',
          quality_reason: '短评被高估',
          emotion_score: 95,
          emotion_type: '正向',
        },
      },
      {
        id: 'row-2',
        rowNumber: 3,
        comment_type: '章评',
        comment_content: '这章节奏不错',
        status: 'completed',
        result: {
          comment_type: '章评',
          quality_score: 72,
          quality_level: '中',
          quality_reason: '有效互动',
          emotion_score: 76,
          emotion_type: '中性',
        },
      },
    ]),
  ]);

  const sample = createLabelingSample(completedRows, { sampleSize: 1, mandatoryContents: ['爽'] });

  assert.equal(sample.length, 1);
  assert.equal(sample[0].comment_content, '爽');
});

test('summarizePromptAccuracy reports unsupervised audit metrics instead of strict accuracy', () => {
  const completedRows = collectCompletedRows([
    task([
      {
        id: 'row-1',
        rowNumber: 2,
        comment_type: '段评',
        comment_content: '爽',
        status: 'completed',
        result: {
          comment_type: '段评',
          quality_score: 85,
          quality_level: '好',
          quality_reason: '短评被高估',
          emotion_score: 95,
          emotion_type: '正向',
        },
      },
    ]),
  ]);

  const summary = summarizePromptAccuracy(completedRows);

  assert.equal(summary.strictAccuracyAvailable, false);
  assert.equal(summary.totalCompletedRows, 1);
  assert.equal(summary.shortParagraphStats.max6.highQualityRate, 1);
  assert.equal(summary.genericShortStats.highQualityRate, 1);
});
