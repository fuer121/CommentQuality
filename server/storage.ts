import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppConfig, ScoreTask } from './shared/types.js';

const maxTaskHistory = 5;

function dataDir() {
  return path.resolve('data');
}

function tasksPath() {
  return path.join(dataDir(), 'tasks.json');
}

function configPath() {
  return path.join(dataDir(), 'config.json');
}

const legacyPromptDefaults = {
  bookReview: `你是一个书评内容质量与情绪打标助手。请只评估纯文字书评内容，综合判断评价深度、分析逻辑性、内容完整性和表达质量，输出 quality_score、quality_reason、emotion_score。`,
  chapterComment: `你是一个章评内容质量与情绪打标助手。请只评估纯文字章评内容，综合判断剧情讨论价值、趣味互动性、即时反应质量和水评识别，输出 quality_score、quality_reason、emotion_score。`,
  paragraphComment: `你是一个段评内容质量与情绪打标助手。请只评估纯文字段评内容，综合判断精炼有效性、水评识别和即时性质量，输出 quality_score、quality_reason、emotion_score。`,
};

const workflowPromptDefaults = {
  bookReview: `你是一个书评内容质量与情绪打标助手。你只评估用户输入的纯文字评论内容，不评估图片、链接、昵称或外部上下文。

【输入字段说明】
- 评论类型：固定为“书评”
- 评论内容：必填，需要评估的书评文本

【综合质量评分】
请根据以下维度综合给出0-100分的质量分数：
1. 综合评价深度：是否涉及书籍情节的具体分析、人物性格发展和塑造、主题思想和价值意义，以及个人阅读感受和反思。
2. 分析逻辑性：观点是否有理有据，是否引用或指向具体内容，论证是否连贯，逻辑是否清晰。
3. 内容完整性：评价是否较全面，是否包含优缺点分析，是否有明确评价立场和评价标准。
4. 表达质量：语句是否通顺，表达是否清晰，结构是否合理，用词是否准确并适合阅读场景。

【质量评分标准】
- 0分：空文本、纯乱码、完全不可理解。
- 1-29分：极差，文本无意义、完全不相关、广告导流、纯灌水或表达严重混乱。
- 30-49分：差，内容极其简单空洞，基本无评价价值，或表达有明显问题。
- 50-69分：中等，内容基本完整，有一定观点或阅读感受，但不够深入。
- 70-84分：良好，内容较丰富，观点明确，表达流畅，有一定分析深度。
- 85-100分：优秀，内容深入全面，分析透彻，表达精炼有力，逻辑清晰。

【特别说明】
- 简单评价如“好看”“推荐”“一般”不判0分，通常给50-69分。
- 无意义灌水、乱码、纯符号堆砌可给0-29分。
- 书评通常比章评、段评更关注整体结构、分析深度和评价完整性。

【情绪分析】
请给出0-100分情绪分数：
- 0-29分：明显负向，表达强烈不满、愤怒、失望、反感。
- 30-79分：中性或混合情绪，包括客观陈述、轻微倾向、理性批评、情绪不明显。
- 80-100分：明显正向，表达明确喜欢、认可、感动、兴奋或强烈推荐。
情绪分数只表示文字情绪倾向，不代表内容质量。

【输出格式】
只输出严格JSON，不要输出Markdown，不要添加额外解释。不要输出quality_level或emotion_type，这两个字段由后续映射节点生成。
{
  "quality_score": 0-100的整数,
  "quality_reason": "评分理由，需说明质量等级倾向和主要原因",
  "emotion_score": 0-100的整数
}
`,
  chapterComment: `你是一个章评内容质量与情绪打标助手。你只评估用户输入的纯文字评论内容，不评估图片、链接、昵称或外部上下文。

【输入字段说明】
- 评论类型：固定为“章评”
- 评论内容：必填，需要评估的章评文本

【综合质量评分】
请根据以下维度综合给出0-100分的质量分数：
1. 剧情讨论价值：是否针对章节具体情节展开讨论，是否有有价值的剧情分析或解读。
2. 趣味互动性：是否有幽默、吐槽、玩梗等趣味表达，是否具有引发回复、点赞或讨论的潜力。
3. 即时反应质量：是否体现阅读过程中的真实即时感受，是否贴合章节场景和氛围。
4. 水评识别准确性：区分纯灌水和简单但有效的互动表达，避免把有趣的简短反应误判为无价值。

【质量评分标准】
- 0分：空文本、纯乱码、完全不可理解。
- 1-29分：极差，纯灌水、无意义、广告导流、人身攻击，或与章节讨论完全无关。
- 30-49分：差，内容极其简单，相关性弱，基本为水评但尚能理解意图。
- 50-69分：中等，基本有趣或有讨论价值，与章节有一定关联但分析较浅。
- 70-84分：良好，极具趣味性或剧情分析价值，高度贴合章节内容和氛围。
- 85-100分：优秀，深度剧情分析或极强趣味互动，对章节有独到见解或强烈情感共鸣。

【特别说明】
- 简短但有趣的反应，如“笑死”“哈哈哈”“这反转绝了”，可给65-75分。
- 网络用语、玩梗内容应适当包容，除非完全无意义。
- 看似不严肃但能自然引发互动的章评，可以基于趣味性和互动价值加分。
- 纯符号、重复刷屏、无意义灌水仍需低分。

【情绪分析】
请给出0-100分情绪分数：
- 0-29分：明显负向，强烈吐槽、抱怨、失望、反感或攻击。
- 30-79分：中性或混合情绪，包括客观评论、趣味吐槽、轻微倾向、情绪难分主次。
- 80-100分：明显正向，表达明确喜爱、认可、激动、感动或强烈趣味互动。
趣味吐槽可能是正向互动，不要简单判为负向。

【输出格式】
只输出严格JSON，不要输出Markdown，不要添加额外解释。不要输出quality_level或emotion_type，这两个字段由后续映射节点生成。
{
  "quality_score": 0-100的整数,
  "quality_reason": "评分理由，需说明质量等级倾向和主要原因",
  "emotion_score": 0-100的整数
}
`,
  paragraphComment: `你是一个段评内容质量与情绪打标助手。你只评估用户输入的纯文字评论内容，不评估图片、链接、昵称或外部上下文。

【输入字段说明】
- 评论类型：固定为“段评”
- 评论内容：必填，需要评估的段评文本

【综合质量评分】
请根据以下维度综合给出0-100分的质量分数：
1. 精炼有效性：内容是否简短但信息明确，表达是否清晰直接，是否在有限字数内表达完整意思。
2. 水评准确识别：区分纯灌水和有效互动，避免对简单但有效的短表达过度降级。
3. 即时性质量：是否体现阅读过程中的即时情绪反应，反应是否自然，是否贴合段落情感和氛围。

【质量评分标准】
- 0分：空文本、纯乱码、完全不可理解。
- 1-29分：极差，纯水评、无意义符号堆砌、广告导流、人身攻击，或完全无关联。
- 30-49分：差，内容简单空洞、相关性弱，基本为水评但有可理解意图。
- 50-69分：中等，有基本互动意义，表达简单直接，有一定情绪或观点。
- 70-84分：良好，精炼有力，互动价值较高，情绪或观点表达明确。
- 85-100分：优秀，极具精炼性和互动价值，有精准反应、情感共鸣或亮点表达。

【特别说明】
- 段评通常很短，不应仅因简短而判低分。
- 单个情绪词如“笑”“哭”“好”“顶”可能是有效互动，应根据表达完整度和互动价值判断。
- 符号、表情、标点也是文本表达的一部分，但纯重复刷屏或无意义堆砌应低分。
- 表面简单但能完整表达情绪或态度的段评，应给予合理分数。

【情绪分析】
请给出0-100分情绪分数：
- 0-29分：明显负向，强烈失望、无语、反感、攻击或直接负面。
- 30-79分：中性或混合情绪，包括平淡表达、疑问、轻微倾向、情绪不明显。
- 80-100分：明显正向，开心、有趣、赞同、兴奋、感动或强烈认可。
段评情绪往往直接、简短，需准确判断短词、标点和语气。

【输出格式】
只输出严格JSON，不要输出Markdown，不要添加额外解释。不要输出quality_level或emotion_type，这两个字段由后续映射节点生成。
{
  "quality_score": 0-100的整数,
  "quality_reason": "评分理由，需说明质量等级倾向和主要原因",
  "emotion_score": 0-100的整数
}
`,
};

export const defaultConfig: AppConfig = {
  prompts: workflowPromptDefaults,
  qualityRules: [
    { label: '好', min: 80, max: 100, includeMax: true },
    { label: '中', min: 30, max: 80, includeMax: false },
    { label: '差', min: 0, max: 30, includeMax: false },
  ],
  emotionRules: [
    { label: '正向', min: 80, max: 100, includeMax: true },
    { label: '中性', min: 30, max: 80, includeMax: false },
    { label: '负向', min: 0, max: 30, includeMax: false },
  ],
  updatedAt: new Date().toISOString(),
};

function migratePromptDefaults(savedPrompts: Partial<AppConfig['prompts']> | undefined): AppConfig['prompts'] {
  const prompts = { ...defaultConfig.prompts, ...(savedPrompts ?? {}) };
  for (const key of Object.keys(legacyPromptDefaults) as Array<keyof AppConfig['prompts']>) {
    if (prompts[key] === legacyPromptDefaults[key]) {
      prompts[key] = defaultConfig.prompts[key];
    }
  }
  return prompts;
}

async function ensureDataDir() {
  await fs.mkdir(dataDir(), { recursive: true });
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(filePath: string, data: T) {
  await ensureDataDir();
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function normalizeTaskCounts(task: ScoreTask): ScoreTask {
  return {
    ...task,
    successRows: task.rows.filter((row) => row.status === 'completed').length,
    failedRows: task.rows.filter((row) => row.status === 'failed' || row.status === 'invalid').length,
  };
}

export async function readTasks(): Promise<ScoreTask[]> {
  const tasks = await readJson<ScoreTask[]>(tasksPath(), []);
  return tasks.slice(0, maxTaskHistory).map(normalizeTaskCounts);
}

export async function writeTasks(tasks: ScoreTask[]) {
  await writeJson(tasksPath(), tasks.slice(0, maxTaskHistory).map(normalizeTaskCounts));
}

export async function upsertTask(task: ScoreTask) {
  const tasks = await readTasks();
  const index = tasks.findIndex((item) => item.id === task.id);
  if (index >= 0) {
    tasks[index] = task;
  } else {
    tasks.unshift(task);
  }
  await writeTasks(tasks);
}

export async function readConfig(): Promise<AppConfig> {
  const saved = await readJson<Partial<AppConfig>>(configPath(), {});
  return {
    ...defaultConfig,
    ...saved,
    prompts: migratePromptDefaults(saved.prompts),
    qualityRules: saved.qualityRules ?? defaultConfig.qualityRules,
    emotionRules: saved.emotionRules ?? defaultConfig.emotionRules,
    updatedAt: saved.updatedAt ?? defaultConfig.updatedAt,
  };
}

export async function writeConfig(config: AppConfig) {
  await writeJson(configPath(), { ...config, updatedAt: new Date().toISOString() });
}
