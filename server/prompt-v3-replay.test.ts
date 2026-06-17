import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildV3ReplayArtifacts,
  classifyReplayOutcome,
  selectReplayRows,
} from './prompt-v3-replay.js';
import type { DiagnosticRow } from './prompt-self-loop.js';

function diagnostic(overrides: Partial<DiagnosticRow>): DiagnosticRow {
  return {
    task_id: 'task-1',
    task_name: '样本任务',
    sample_source: 'latest',
    comment_type: '段评',
    comment_content: '哈哈',
    current_quality_score: 85,
    current_quality_level: '好',
    current_quality_reason: '短评被高估',
    current_emotion_score: 92,
    current_emotion_type: '正向',
    issue_type: '段评短泛评高分',
    platform_review: '短泛评不能进入高质量',
    v3_target_quality_band: '30-49 或 50-69',
    v3_target_emotion_type: '按文本情绪判断',
    prompt_rule_hint: '段评短文本高分必须有明确对象',
    ...overrides,
  };
}

test('classifyReplayOutcome detects expected V3 improvements and guardrails', () => {
  assert.equal(classifyReplayOutcome(diagnostic({ issue_type: '段评短泛评高分' })), 'expected_downscore');
  assert.equal(classifyReplayOutcome(diagnostic({ issue_type: '负向吐槽情绪偏高' })), 'expected_emotion_fix');
  assert.equal(classifyReplayOutcome(diagnostic({ issue_type: '优质短评误杀风险' })), 'guardrail_keep_quality');
});

test('selectReplayRows keeps issue diversity with a per issue limit', () => {
  const rows = [
    diagnostic({ issue_type: '段评短泛评高分', comment_content: '哈哈' }),
    diagnostic({ issue_type: '段评短泛评高分', comment_content: '来了' }),
    diagnostic({ issue_type: '章评占楼灌水', comment_type: '章评', comment_content: '打卡' }),
  ];

  const selected = selectReplayRows(rows, { perIssueLimit: 1 });

  assert.deepEqual(selected.map((row) => row.comment_content), ['哈哈', '打卡']);
});

test('buildV3ReplayArtifacts renders CSV and markdown with offline validation disclaimer', () => {
  const artifacts = buildV3ReplayArtifacts([
    diagnostic({ issue_type: '段评短泛评高分', comment_content: '哈哈' }),
    diagnostic({ issue_type: '优质短评误杀风险', comment_content: '哪来的一万', current_quality_score: 45 }),
  ]);

  assert.match(artifacts.markdown, /离线候选回放/);
  assert.match(artifacts.markdown, /尚未调用线上 V3 工作流/);
  assert.match(artifacts.markdown, /expected_downscore/);
  assert.match(artifacts.markdown, /guardrail_keep_quality/);
  assert.match(artifacts.csv, /replay_outcome/);
  assert.match(artifacts.csv, /哪来的一万/);
});
