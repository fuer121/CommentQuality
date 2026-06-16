export type CommentTypeFilter = '全部' | '书评' | '章评' | '段评';

type FilterableTaskRow = {
  comment_type: string;
  comment_content: string;
  result?: {
    quality_reason?: string;
  };
};

export function filterTaskRows<T extends FilterableTaskRow>(
  rows: T[],
  filters: { query: string; commentType: CommentTypeFilter },
) {
  const keyword = filters.query.trim();

  return rows.filter((row) => {
    const matchesType = filters.commentType === '全部' || row.comment_type === filters.commentType;
    const matchesQuery = !keyword || `${row.comment_type}${row.comment_content}${row.result?.quality_reason ?? ''}`.includes(keyword);
    return matchesType && matchesQuery;
  });
}
