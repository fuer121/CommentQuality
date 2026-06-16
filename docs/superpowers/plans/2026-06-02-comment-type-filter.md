# Comment Type Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a comment-type dropdown beside the existing keyword search so task-detail rows can be filtered by `全部 / 书评 / 章评 / 段评`.

**Architecture:** Keep filtering on the client. Extract the row filtering into a small pure helper so the behavior can be covered by the existing Node test setup without introducing a frontend test runner. Then wire the helper into `src/main.tsx` and render a `<select>` next to the search input.

**Tech Stack:** React, TypeScript, Vite, Node test runner via `tsx`

---

### Task 1: Lock the filtering behavior with a failing test

**Files:**
- Create: `server/filter-rows.test.ts`
- Create: `src/task-row-filters.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { filterTaskRows } from '../src/task-row-filters.ts';

const rows = [
  { id: '1', comment_type: '书评', comment_content: '剧情很好', status: 'completed' },
  { id: '2', comment_type: '章评', comment_content: '这章精彩', status: 'completed' },
  { id: '3', comment_type: '段评', comment_content: '这句有意思', status: 'completed' },
];

test('filterTaskRows applies comment type and keyword together', () => {
  const result = filterTaskRows(rows, { query: '精彩', commentType: '章评' });
  assert.deepEqual(result.map((row) => row.id), ['2']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test --test-concurrency=1 server/filter-rows.test.ts`
Expected: FAIL because `../src/task-row-filters.ts` or `filterTaskRows` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export function filterTaskRows(rows, filters) {
  return rows.filter((row) => {
    const matchesType = filters.commentType === '全部' || row.comment_type === filters.commentType;
    const keyword = filters.query.trim();
    const haystack = `${row.comment_type}${row.comment_content}${row.result?.quality_reason ?? ''}`;
    const matchesQuery = !keyword || haystack.includes(keyword);
    return matchesType && matchesQuery;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test --test-concurrency=1 server/filter-rows.test.ts`
Expected: PASS

### Task 2: Wire the filter into the task detail UI

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Add state for the dropdown**

```ts
const [commentTypeFilter, setCommentTypeFilter] = useState<'全部' | CommentType>('全部');
```

- [ ] **Step 2: Replace the inline `rows` memo with the shared helper**

```ts
const rows = useMemo(() => {
  return filterTaskRows(selectedTask?.rows ?? [], {
    query,
    commentType: commentTypeFilter,
  });
}, [selectedTask, query, commentTypeFilter]);
```

- [ ] **Step 3: Render the select beside the existing search input**

```tsx
<select value={commentTypeFilter} onChange={(event) => setCommentTypeFilter(event.target.value as '全部' | CommentType)}>
  <option value="全部">全部类型</option>
  <option value="书评">书评</option>
  <option value="章评">章评</option>
  <option value="段评">段评</option>
</select>
```

- [ ] **Step 4: Keep the rest of the action row unchanged**

No extra behavior, no backend change, no auto-reset on task switch.

### Task 3: Verify behavior end to end

**Files:**
- Verify: `server/filter-rows.test.ts`
- Verify: `src/main.tsx`

- [ ] **Step 1: Run the full existing automated checks needed for this change**

Run: `npm test`
Expected: PASS

- [ ] **Step 2: Run a production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Check in the browser**

Open the task detail view and confirm:
- default is “全部类型”
- choosing “章评” only shows 章评 rows
- keyword search still narrows within the selected type
