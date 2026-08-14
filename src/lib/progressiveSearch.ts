import { SearchResult } from '@/lib/types';
import { getEpisodeCount } from '@/lib/utils';

export type ApiSiteBrief = { key: string; name: string };

export const DEFAULT_SEARCH_CONCURRENCY = 4;

/** 播放页/搜索页共用的标题匹配过滤 */
export function filterResultsByTitle(
  results: SearchResult[],
  title: string,
  year?: string,
  searchType?: string | null
): SearchResult[] {
  const normalizedTitle = title.replaceAll(' ', '').toLowerCase();
  return results.filter((result) => {
    if (result.title.replaceAll(' ', '').toLowerCase() !== normalizedTitle) {
      return false;
    }
    if (year && result.year.toLowerCase() !== year.toLowerCase()) {
      return false;
    }
    if (searchType) {
      const episodeCount = getEpisodeCount(result);
      if (searchType === 'tv' && episodeCount <= 1) return false;
      if (searchType === 'movie' && episodeCount !== 1) return false;
    }
    return true;
  });
}

function mergeUniqueResults(
  existing: SearchResult[],
  incoming: SearchResult[]
): SearchResult[] {
  if (!incoming.length) return existing;
  const seen = new Set(existing.map((r) => `${r.source}+${r.id}`));
  const merged = [...existing];
  for (const item of incoming) {
    const key = `${item.source}+${item.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

/**
 * 按源并发搜索，结果渐进合并。
 * @param lite 浏览搜索传 true；播放页换源需完整 episodes，传 false
 */
export async function searchSourcesProgressive(options: {
  query: string;
  lite?: boolean;
  signal?: AbortSignal;
  concurrency?: number;
  onBatch?: (merged: SearchResult[]) => void;
  filter?: (results: SearchResult[]) => SearchResult[];
}): Promise<SearchResult[]> {
  const {
    query,
    lite = false,
    signal,
    concurrency = DEFAULT_SEARCH_CONCURRENCY,
    onBatch,
    filter,
  } = options;

  const trimmed = query.trim();
  if (!trimmed) return [];

  const resourcesRes = await fetch('/api/search/resources', { signal });
  if (!resourcesRes.ok) {
    throw new Error('获取搜索源失败');
  }
  const resources = (await resourcesRes.json()) as ApiSiteBrief[];
  if (!Array.isArray(resources) || resources.length === 0) {
    return [];
  }

  let merged: SearchResult[] = [];
  let pendingIndex = 0;

  const applyBatch = (batch: SearchResult[]) => {
    const filtered = filter ? filter(batch) : batch;
    if (!filtered.length) return;
    merged = mergeUniqueResults(merged, filtered);
    onBatch?.(merged);
  };

  const searchOne = async (site: ApiSiteBrief) => {
    try {
      const liteParam = lite ? '&lite=1' : '';
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(
          trimmed
        )}&source=${encodeURIComponent(site.key)}${liteParam}`,
        { signal }
      );
      if (!response.ok) return;
      const data = await response.json();
      applyBatch(data.results || []);
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') throw error;
    }
  };

  const worker = async () => {
    while (!signal?.aborted) {
      const index = pendingIndex++;
      if (index >= resources.length) return;
      await searchOne(resources[index]);
    }
  };

  const pool = Math.min(concurrency, resources.length);
  await Promise.all(Array.from({ length: pool }, () => worker()));

  return merged;
}
