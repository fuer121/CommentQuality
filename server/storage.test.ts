import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const legacyPrompts = {
  bookReview: '你是一个书评内容质量与情绪打标助手。请只评估纯文字书评内容，综合判断评价深度、分析逻辑性、内容完整性和表达质量，输出 quality_score、quality_reason、emotion_score。',
  chapterComment: '你是一个章评内容质量与情绪打标助手。请只评估纯文字章评内容，综合判断剧情讨论价值、趣味互动性、即时反应质量和水评识别，输出 quality_score、quality_reason、emotion_score。',
  paragraphComment: '你是一个段评内容质量与情绪打标助手。请只评估纯文字段评内容，综合判断精炼有效性、水评识别和即时性质量，输出 quality_score、quality_reason、emotion_score。',
};

async function importStorageInTempDataDir() {
  const repoRoot = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comment-quality-storage-'));
  process.chdir(tempDir);
  const storageUrl = `${pathToFileURL(path.join(repoRoot, 'server/storage.ts')).href}?case=${Date.now()}`;
  const storage = await import(storageUrl);
  return { tempDir, storage };
}

test('defaults use full prompts from workflow scoring nodes', async () => {
  const repoRoot = process.cwd();
  const { tempDir, storage } = await importStorageInTempDataDir();

  try {
    assert.ok(storage.defaultConfig.prompts.bookReview.length > 900);
    assert.ok(storage.defaultConfig.prompts.chapterComment.length > 900);
    assert.ok(storage.defaultConfig.prompts.paragraphComment.length > 900);
    assert.match(storage.defaultConfig.prompts.bookReview, /不要输出quality_level或emotion_type/);
    assert.match(storage.defaultConfig.prompts.chapterComment, /简短但有趣的反应/);
    assert.match(storage.defaultConfig.prompts.paragraphComment, /段评通常很短/);
  } finally {
    process.chdir(repoRoot);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('legacy simplified prompt defaults are migrated to workflow node prompts', async () => {
  const repoRoot = process.cwd();
  const { tempDir, storage } = await importStorageInTempDataDir();

  try {
    await fs.mkdir('data', { recursive: true });
    await fs.writeFile(
      path.join('data', 'config.json'),
      `${JSON.stringify({
        prompts: legacyPrompts,
        qualityRules: [{ label: '优', min: 90, max: 100, includeMax: true }],
        emotionRules: [{ label: '积极', min: 80, max: 100, includeMax: true }],
        updatedAt: '2026-05-29T00:00:00.000Z',
      })}\n`,
      'utf8',
    );

    const config = await storage.readConfig();

    assert.equal(config.prompts.bookReview, storage.defaultConfig.prompts.bookReview);
    assert.equal(config.prompts.chapterComment, storage.defaultConfig.prompts.chapterComment);
    assert.equal(config.prompts.paragraphComment, storage.defaultConfig.prompts.paragraphComment);
    assert.equal(config.qualityRules[0].label, '优');
    assert.equal(config.emotionRules[0].label, '积极');
  } finally {
    process.chdir(repoRoot);
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
