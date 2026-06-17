import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildV3ReplayArtifacts } from '../server/prompt-v3-replay.js';
import { createDiagnosticRows, selectLatestTask } from '../server/prompt-self-loop.js';
import type { ScoreTask } from '../server/shared/types.js';

const outputDir = path.resolve('project/prompt-optimization/self-loop');

function taskIdArg() {
  const index = process.argv.indexOf('--task-id');
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const raw = await fs.readFile(path.resolve('data/tasks.json'), 'utf8');
  const tasks = JSON.parse(raw) as ScoreTask[];
  const taskId = taskIdArg();
  const latestTask = selectLatestTask(tasks, taskId);
  const diagnostics = createDiagnosticRows(latestTask, tasks.filter((task) => task.id !== latestTask.id));
  const artifacts = buildV3ReplayArtifacts(diagnostics);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'v3-replay-validation.md'), artifacts.markdown, 'utf8');
  await fs.writeFile(path.join(outputDir, 'v3-replay-samples.csv'), artifacts.csv, 'utf8');

  console.log(`Wrote V3 replay validation artifacts to ${outputDir}`);
}

await main();
