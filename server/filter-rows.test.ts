import assert from 'node:assert/strict';
import test from 'node:test';
import { filterTaskRows } from '../src/task-row-filters';

const rows = [
  {
    id: 'row-1',
    rowNumber: 2,
    comment_type: '书评',
    comment_content: '剧情很好',
    status: 'completed' as const,
  },
  {
    id: 'row-2',
    rowNumber: 3,
    comment_type: '章评',
    comment_content: '这章精彩',
    status: 'completed' as const,
    result: { quality_reason: '角色塑造精彩' },
  },
  {
    id: 'row-3',
    rowNumber: 4,
    comment_type: '段评',
    comment_content: '这句有意思',
    status: 'completed' as const,
  },
];

test('filterTaskRows applies comment type and keyword together', () => {
  const result = filterTaskRows(rows, { query: '精彩', commentType: '章评' });
  assert.deepEqual(result.map((row) => row.id), ['row-2']);
});
