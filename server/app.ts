import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import XLSX from 'xlsx';
import { nanoid } from 'nanoid';
import { getDifyStatus, runDifyScore } from './dify.js';
import { parseExcelRows, toExportRows } from './excel.js';
import { readConfig, readTasks, upsertTask, writeConfig } from './storage.js';
import type { ScoreResult, ScoreTask, TaskRow } from './shared/types.js';

type RunMode = 'all' | 'failed' | 'remaining';
type ScoreRunner = (input: {
  comment_type: string;
  comment_content: string;
}) => Promise<{ result: ScoreResult; raw: unknown }>;

interface AppOptions {
  runScore?: ScoreRunner;
}

const upload = multer({ dest: path.resolve('uploads') });

function normalizeUploadFileName(name: string) {
  if (!/[ÃÂÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßà-ÿ]|å|æ|ç|è|é|ê|ë|ì|í|î|ï|ð|ñ|ò|ó|ô|õ|ö|ø|ù|ú|û|ü/.test(name)) {
    return name;
  }
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('\uFFFD') ? name : decoded;
  } catch {
    return name;
  }
}

function shouldRun(row: TaskRow, mode: RunMode) {
  if (row.status === 'invalid') return false;
  if (mode === 'failed') return row.status === 'failed';
  if (mode === 'remaining') return row.status !== 'completed';
  return true;
}

function hasRemainingRows(task: ScoreTask) {
  return task.rows.some((row) => row.status !== 'invalid' && row.status !== 'completed');
}

function updateTaskCounts(task: ScoreTask) {
  task.successRows = task.rows.filter((row) => row.status === 'completed').length;
  task.failedRows = task.rows.filter((row) => row.status === 'failed' || row.status === 'invalid').length;
}

function finishTaskStatus(task: ScoreTask, pauseRequested: boolean) {
  updateTaskCounts(task);
  if (pauseRequested && hasRemainingRows(task)) {
    task.status = 'paused';
  } else {
    task.status = task.failedRows > 0 ? 'completed_with_errors' : 'completed';
  }
  task.updatedAt = new Date().toISOString();
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  const runScore = options.runScore ?? runDifyScore;
  const pauseRequests = new Set<string>();
  const runningTaskIds = new Set<string>();

  app.use(express.json({ limit: '2mb' }));

  async function runTaskById(taskId: string, mode: RunMode): Promise<ScoreTask | undefined> {
    if (runningTaskIds.has(taskId)) {
      throw new Error('任务正在运行，请等待当前批次结束或暂停生效');
    }

    const tasks = await readTasks();
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return undefined;

    runningTaskIds.add(task.id);
    pauseRequests.delete(task.id);
    try {
      task.status = 'running';
      task.updatedAt = new Date().toISOString();

      if (mode === 'remaining') {
        for (const row of task.rows) {
          if (row.status === 'running') row.status = 'pending';
        }
      }

      await upsertTask(task);

      for (const row of task.rows) {
        if (pauseRequests.has(task.id)) break;
        if (!shouldRun(row, mode)) continue;

        row.status = 'running';
        row.error = undefined;
        task.updatedAt = new Date().toISOString();
        await upsertTask(task);

        try {
          const { result, raw } = await runScore({
            comment_type: row.comment_type,
            comment_content: row.comment_content,
          });
          row.status = 'completed';
          row.result = result;
          row.rawResponse = raw;
        } catch (error) {
          row.status = 'failed';
          row.error = error instanceof Error ? error.message : '未知错误';
        }

        task.updatedAt = new Date().toISOString();
        await upsertTask(task);
      }

      const pauseRequested = pauseRequests.has(task.id);
      finishTaskStatus(task, pauseRequested);
      if (!pauseRequested) pauseRequests.delete(task.id);
      await upsertTask(task);
      return task;
    } finally {
      runningTaskIds.delete(task.id);
    }
  }

  app.get('/api/health', async (_req, res) => {
    res.json({
      ok: true,
      dify: getDifyStatus(),
      storage: 'local-json',
    });
  });

  app.get('/api/config', async (_req, res, next) => {
    try {
      res.json(await readConfig());
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/config', async (req, res, next) => {
    try {
      await writeConfig(req.body);
      res.json(await readConfig());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/config/inject', async (_req, res) => {
    res.status(501).json({
      ok: false,
      message: '当前 Dify App API 已验证可运行工作流，但未暴露线上节点编辑端点。请提供 Dify 管理端/Console API 写权限后再启用线上注入。',
    });
  });

  app.get('/api/tasks', async (_req, res, next) => {
    try {
      const tasks = await readTasks();
      res.json(tasks.map(({ rows: _rows, ...task }) => task));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/tasks/:id', async (req, res, next) => {
    try {
      const task = (await readTasks()).find((item) => item.id === req.params.id);
      if (!task) {
        res.status(404).json({ error: '任务不存在' });
        return;
      }
      res.json(task);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/tasks/upload', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: '缺少 Excel 文件' });
        return;
      }
      const rows = parseExcelRows(req.file.path);
      const originalName = normalizeUploadFileName(req.file.originalname);
      const now = new Date().toISOString();
      const task: ScoreTask = {
        id: nanoid(10),
        name: req.body.name || originalName.replace(/\.[^.]+$/, ''),
        fileName: originalName,
        status: 'created',
        totalRows: rows.length,
        validRows: rows.filter((row) => row.status !== 'invalid').length,
        successRows: 0,
        failedRows: rows.filter((row) => row.status === 'invalid').length,
        createdAt: now,
        updatedAt: now,
        rows,
      };
      await upsertTask(task);
      await fs.unlink(req.file.path).catch(() => undefined);
      res.json(task);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/tasks/:id/run', async (req, res, next) => {
    try {
      const mode = req.body?.mode === 'failed' ? 'failed' : 'all';
      const task = await runTaskById(req.params.id, mode);
      if (!task) {
        res.status(404).json({ error: '任务不存在' });
        return;
      }
      res.json(task);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/tasks/:id/pause', async (req, res, next) => {
    try {
      const task = (await readTasks()).find((item) => item.id === req.params.id);
      if (!task) {
        res.status(404).json({ error: '任务不存在' });
        return;
      }

      if (task.status === 'running') {
        pauseRequests.add(task.id);
      }
      if (task.status === 'created' || task.status === 'running') {
        task.status = 'paused';
        task.updatedAt = new Date().toISOString();
        await upsertTask(task);
      }
      res.json(task);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/tasks/:id/continue', async (req, res, next) => {
    try {
      const task = await runTaskById(req.params.id, 'remaining');
      if (!task) {
        res.status(404).json({ error: '任务不存在' });
        return;
      }
      res.json(task);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/tasks/:id/export', async (req, res, next) => {
    try {
      const task = (await readTasks()).find((item) => item.id === req.params.id);
      if (!task) {
        res.status(404).json({ error: '任务不存在' });
        return;
      }

      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(toExportRows(task.rows));
      XLSX.utils.book_append_sheet(workbook, sheet, 'results');
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(`${task.name}-results.xlsx`)}"`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : '服务异常';
    res.status(500).json({ error: message });
  });

  return app;
}
