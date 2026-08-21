import { ShortDramaItem } from '@/lib/shortdrama';

export interface FetchShortDramaOptions {
  page: number;
  signal?: AbortSignal;
}

export interface ShortDramaResponse {
  results: ShortDramaItem[];
  hasMore: boolean;
}

export async function fetchShortDramaPage({
  page,
  signal,
}: FetchShortDramaOptions): Promise<ShortDramaResponse> {
  const response = await fetch(`/api/shortdrama?page=${page}`, { signal });
  if (!response.ok) {
    throw new Error('获取短剧失败');
  }
  const data = (await response.json()) as Partial<ShortDramaResponse>;
  return {
    results: data.results ?? [],
    hasMore: Boolean(data.hasMore),
  };
}
