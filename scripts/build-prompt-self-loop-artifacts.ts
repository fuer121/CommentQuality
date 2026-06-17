import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildSelfLoopArtifacts } from '../server/prompt-self-loop.js';
import type { ScoreTask } from '../server/shared/types.js';

const outputDir = path.resolve('project/prompt-optimization/self-loop');

function taskIdArg() {
  const index = process.argv.indexOf('--task-id');
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const raw = await fs.readFile(path.resolve('data/tasks.json'), 'utf8');
  const tasks = JSON.parse(raw) as ScoreTask[];
  const artifacts = buildSelfLoopArtifacts(tasks, { taskId: taskIdArg() });

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'latest-task-snapshot.md'), artifacts.snapshotMarkdown, 'utf8');
  await fs.writeFile(path.join(outputDir, 'type-standards.md'), artifacts.typeStandardsMarkdown, 'utf8');
  await fs.writeFile(path.join(outputDir, 'diagnostic-samples.csv'), artifacts.diagnosticCsv, 'utf8');
  await fs.writeFile(path.join(outputDir, 'v3-prompts.md'), artifacts.v3PromptsMarkdown, 'utf8');
  await fs.writeFile(path.join(outputDir, 'v1-v3-review.md'), artifacts.reviewMarkdown, 'utf8');

  console.log(`Wrote prompt self-loop artifacts to ${outputDir}`);
}

await main();
