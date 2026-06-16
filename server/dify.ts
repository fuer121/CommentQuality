import type { CommentType, ScoreResult } from './shared/types.js';

interface DifyRunResponse {
  workflow_run_id?: string;
  data?: {
    status?: string;
    outputs?: ScoreResult;
    error?: string;
  };
}

export function getDifyStatus() {
  return {
    configured: Boolean(process.env.DIFY_API_BASE_URL && process.env.DIFY_API_KEY),
    baseUrl: process.env.DIFY_API_BASE_URL ? new URL(process.env.DIFY_API_BASE_URL).origin : '',
  };
}

export async function runDifyScore(input: {
  comment_type: CommentType | string;
  comment_content: string;
  prompt_version?: string;
}): Promise<{ result: ScoreResult; raw: DifyRunResponse }> {
  const baseUrl = process.env.DIFY_API_BASE_URL?.replace(/\/$/, '');
  const apiKey = process.env.DIFY_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('Dify API 未配置');
  }

  const response = await fetch(`${baseUrl}/workflows/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: input,
      response_mode: 'blocking',
      user: process.env.DIFY_USER || 'comment-quality-local',
    }),
  });

  const rawText = await response.text();
  let raw: DifyRunResponse;
  try {
    raw = JSON.parse(rawText) as DifyRunResponse;
  } catch {
    throw new Error(`Dify 返回非 JSON：HTTP ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(raw.data?.error || `Dify 请求失败：HTTP ${response.status}`);
  }

  if (raw.data?.status !== 'succeeded' || !raw.data.outputs) {
    throw new Error(raw.data?.error || `Dify 工作流未成功：${raw.data?.status || 'unknown'}`);
  }

  return { result: raw.data.outputs, raw };
}
