import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import type { ScoreTask } from './shared/types.js';

function makeTask(id: string, status: ScoreTask['status'] = 'created'): ScoreTask {
  return {
    id,
    name: `任务 ${id}`,
    fileName: `${id}.xlsx`,
    status,
    totalRows: 1,
    validRows: 1,
    successRows: 0,
    failedRows: 0,
    createdAt: `2026-05-29T00:00:0${id.slice(-1)}.000Z`,
    updatedAt: `2026-05-29T00:00:0${id.slice(-1)}.000Z`,
    rows: [
      {
        id: `${id}-row`,
        rowNumber: 2,
        comment_type: '书评',
        comment_content: `内容 ${id}`,
        status: 'pending',
      },
    ],
  };
}

async function withApp(seedTasks: ScoreTask[], run: (baseUrl: string) => Promise<void>) {
  const repoRoot = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comment-quality-app-'));
  process.chdir(tempDir);

  let server: http.Server | undefined;
  try {
    await fs.mkdir('data', { recursive: true });
    await fs.writeFile(path.join('data', 'tasks.json'), `${JSON.stringify(seedTasks, null, 2)}\n`, 'utf8');

    const appUrl = `${pathToFileURL(path.join(repoRoot, 'server/app.ts')).href}?case=${Date.now()}`;
    const { createApp } = await import(appUrl);
    const app = createApp({
      runScore: async ({ comment_type }: { comment_type: string }) => ({
        result: {
          comment_type,
          quality_score: 88,
          quality_level: '好',
          quality_reason: '测试跑分结果',
          emotion_score: 82,
          emotion_type: '正向',
        },
        raw: { test: true },
      }),
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => {
      assert.ok(server);
      server.once('listening', resolve);
    });
    assert.ok(server);
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }
      server.close((error) => (error ? reject(error) : resolve()));
    });
    process.chdir(repoRoot);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('task list API keeps only the latest five task records', async () => {
  await withApp(['t6', 't5', 't4', 't3', 't2', 't1'].map((id) => makeTask(id)), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/tasks`);
    assert.equal(response.status, 200);
    const tasks = await response.json() as Array<{ id: string }>;
    assert.deepEqual(tasks.map((task) => task.id), ['t6', 't5', 't4', 't3', 't2']);
  });
});

test('task can be paused and continued as a whole task', async () => {
  const task = makeTask('pause-me', 'running');
  await withApp([task], async (baseUrl) => {
    const pausedResponse = await fetch(`${baseUrl}/api/tasks/pause-me/pause`, { method: 'POST' });
    assert.equal(pausedResponse.status, 200);
    const paused = await pausedResponse.json() as ScoreTask;
    assert.equal(paused.status, 'paused');

    const continuedResponse = await fetch(`${baseUrl}/api/tasks/pause-me/continue`, { method: 'POST' });
    assert.equal(continuedResponse.status, 200);
    const continued = await continuedResponse.json() as ScoreTask;
    assert.equal(continued.status, 'completed');
    assert.equal(continued.successRows, 1);
    assert.equal(continued.rows[0].status, 'completed');
  });
});
