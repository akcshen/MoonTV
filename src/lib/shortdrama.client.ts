import { ShortDramaItem } from '@/lib/shortdrama';

export interface FetchShortDramaOptions {
  page: number;
  /** 题材 label，空表示全部 */
  genre?: string;
  signal?: AbortSignal;
}

export interface ShortDramaResponse {
  results: ShortDramaItem[];
  hasMore: boolean;
}

export async function fetchShortDramaPage({
  page,
  genre = '',
  signal,
}: FetchShortDramaOptions): Promise<ShortDramaResponse> {
  const params = new URLSearchParams({ page: String(page) });
  if (genre) params.set('genre', genre);

  const response = await fetch(`/api/shortdrama?${params.toString()}`, {
    signal,
  });
  if (!response.ok) {
    throw new Error('获取短剧失败');
  }
  const data = (await response.json()) as Partial<ShortDramaResponse>;
  return {
    results: data.results ?? [],
    hasMore: Boolean(data.hasMore),
  };
}
