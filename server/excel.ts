import XLSX from 'xlsx';
import { nanoid } from 'nanoid';
import type { CommentType, TaskRow } from './shared/types.js';

const validTypes = new Set<CommentType>(['书评', '章评', '段评']);

function pickValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

export function parseExcelRows(filePath: string): TaskRow[] {
  const workbook = XLSX.readFile(filePath);
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw new Error('Excel 文件没有工作表');
  }

  const sheet = workbook.Sheets[firstSheet];
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return records.map((record, index) => {
    const commentType = pickValue(record, ['comment_type', '评论类型', '类型']);
    const commentContent = pickValue(record, ['comment_content', '评论内容', '内容']);
    const errors: string[] = [];
    if (!commentType) errors.push('缺少评论类型');
    if (commentType && !validTypes.has(commentType as CommentType)) errors.push('评论类型必须是书评、章评或段评');
    if (!commentContent) errors.push('缺少评论内容');

    return {
      id: nanoid(10),
      rowNumber: index + 2,
      comment_type: commentType,
      comment_content: commentContent,
      status: errors.length ? 'invalid' : 'pending',
      error: errors.join('；') || undefined,
    };
  });
}

export function toExportRows(rows: TaskRow[]) {
  return rows.map((row) => ({
    row_number: row.rowNumber,
    comment_type: row.comment_type,
    comment_content: row.comment_content,
    quality_score: row.result?.quality_score ?? '',
    quality_level: row.result?.quality_level ?? '',
    quality_reason: row.result?.quality_reason ?? row.error ?? '',
    emotion_score: row.result?.emotion_score ?? '',
    emotion_type: row.result?.emotion_type ?? '',
    status: row.status,
  }));
}
