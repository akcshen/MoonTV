import { SearchResult } from '@/lib/types';
import { getEpisodeCount } from '@/lib/utils';
import { yellowWords } from '@/lib/yellow';

export type ApiSiteBrief = { key: string; name: string };
export type AggregatedSearchEntry = [string, SearchResult[]];

export const DEFAULT_SEARCH_CONCURRENCY = 4;

function resultKey(result: SearchResult): string {
  return `${result.source}+${result.id}`;
}

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

/** 搜索页色情内容过滤 */
export function filterYellowResults(results: SearchResult[]): SearchResult[] {
  if (
    typeof window !== 'undefined' &&
    (
      window as Window & {
        RUNTIME_CONFIG?: { DISABLE_YELLOW_FILTER?: boolean };
      }
    ).RUNTIME_CONFIG?.DISABLE_YELLOW_FILTER
  ) {
    return results;
  }
  return results.filter((result) => {
    const typeName = result.type_name || '';
    return !yellowWords.some((word: string) => typeName.includes(word));
  });
}

/** 聚合分组键：标题 + 年份 + 类型 */
export function getAggregateKey(item: SearchResult): string {
  const episodeCount = getEpisodeCount(item);
  return `${item.title.replaceAll(' ', '')}-${item.year || 'unknown'}-${
    episodeCount === 1 ? 'movie' : 'tv'
  }`;
}

export function compareSearchResults(
  a: SearchResult,
  b: SearchResult,
  query: string
): number {
  const q = query.trim();
  const aExactMatch = a.title === q;
  const bExactMatch = b.title === q;

  if (aExactMatch && !bExactMatch) return -1;
  if (!aExactMatch && bExactMatch) return 1;

  if (a.year === b.year) {
    return a.title.localeCompare(b.title);
  }
  if (a.year === 'unknown' && b.year === 'unknown') {
    return 0;
  }
  if (a.year === 'unknown') return 1;
  if (b.year === 'unknown') return -1;
  return parseInt(a.year, 10) > parseInt(b.year, 10) ? -1 : 1;
}

export function sortSearchResults(
  results: SearchResult[],
  query: string
): SearchResult[] {
  return [...results].sort((a, b) => compareSearchResults(a, b, query));
}

/** 将新增结果合并进已排序列表，避免每批全量 sort */
export function mergeSortedSearchResults(
  existing: SearchResult[],
  incoming: SearchResult[],
  query: string
): SearchResult[] {
  if (!incoming.length) return existing;

  const seen = new Set(existing.map(resultKey));
  const newItems: SearchResult[] = [];
  for (const item of incoming) {
    const key = resultKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      newItems.push(item);
    }
  }
  if (!newItems.length) return existing;

  newItems.sort((a, b) => compareSearchResults(a, b, query));
  if (!existing.length) return newItems;

  const merged: SearchResult[] = [];
  let left = 0;
  let right = 0;
  while (left < existing.length && right < newItems.length) {
    if (compareSearchResults(existing[left], newItems[right], query) <= 0) {
      merged.push(existing[left++]);
    } else {
      merged.push(newItems[right++]);
    }
  }
  while (left < existing.length) merged.push(existing[left++]);
  while (right < newItems.length) merged.push(newItems[right++]);
  return merged;
}

function compareAggregateGroups(
  aKey: string,
  bKey: string,
  aGroup: SearchResult[],
  bGroup: SearchResult[],
  normalizedQuery: string
): number {
  const aExactMatch = aGroup[0].title
    .replaceAll(' ', '')
    .includes(normalizedQuery);
  const bExactMatch = bGroup[0].title
    .replaceAll(' ', '')
    .includes(normalizedQuery);

  if (aExactMatch && !bExactMatch) return -1;
  if (!aExactMatch && bExactMatch) return 1;

  const aYear = aGroup[0].year;
  const bYear = bGroup[0].year;

  if (aYear === bYear) {
    return aKey.localeCompare(bKey);
  }
  if (aYear === 'unknown' && bYear === 'unknown') return 0;
  if (aYear === 'unknown') return 1;
  if (bYear === 'unknown') return -1;
  return aYear > bYear ? -1 : 1;
}

/** 搜索页聚合视图：按 batch 增量更新，避免每批全量 rebuild */
export class SearchResultsAggregator {
  private map = new Map<string, SearchResult[]>();
  private sortedKeys: string[] = [];
  private normalizedQuery = '';

  reset(query: string): void {
    this.map.clear();
    this.sortedKeys = [];
    this.normalizedQuery = query.trim().replaceAll(' ', '');
  }

  addBatch(items: SearchResult[]): AggregatedSearchEntry[] {
    const newKeys: string[] = [];

    for (const item of items) {
      const key = getAggregateKey(item);
      const group = this.map.get(key);
      if (group) {
        if (!group.some((g) => g.source === item.source && g.id === item.id)) {
          group.push(item);
        }
      } else {
        this.map.set(key, [item]);
        newKeys.push(key);
      }
    }

    if (newKeys.length) {
      const sortedNewKeys = newKeys.sort((a, b) => {
        const aGroup = this.map.get(a);
        const bGroup = this.map.get(b);
        if (!aGroup || !bGroup) return 0;
        return compareAggregateGroups(
          a,
          b,
          aGroup,
          bGroup,
          this.normalizedQuery
        );
      });

      if (!this.sortedKeys.length) {
        this.sortedKeys = sortedNewKeys;
      } else {
        const mergedKeys: string[] = [];
        let left = 0;
        let right = 0;
        while (left < this.sortedKeys.length && right < sortedNewKeys.length) {
          const leftKey = this.sortedKeys[left];
          const rightKey = sortedNewKeys[right];
          const leftGroup = this.map.get(leftKey);
          const rightGroup = this.map.get(rightKey);
          if (!leftGroup || !rightGroup) {
            if (!leftGroup) left += 1;
            if (!rightGroup) right += 1;
            continue;
          }
          if (
            compareAggregateGroups(
              leftKey,
              rightKey,
              leftGroup,
              rightGroup,
              this.normalizedQuery
            ) <= 0
          ) {
            mergedKeys.push(leftKey);
            left += 1;
          } else {
            mergedKeys.push(rightKey);
            right += 1;
          }
        }
        while (left < this.sortedKeys.length) {
          mergedKeys.push(this.sortedKeys[left++]);
        }
        while (right < sortedNewKeys.length) {
          mergedKeys.push(sortedNewKeys[right++]);
        }
        this.sortedKeys = mergedKeys;
      }
    }

    return this.getEntries();
  }

  getEntries(): AggregatedSearchEntry[] {
    return this.sortedKeys.flatMap((key) => {
      const group = this.map.get(key);
      return group ? ([[key, group]] as AggregatedSearchEntry[]) : [];
    });
  }
}

function mergeUniqueResults(
  existing: SearchResult[],
  incoming: SearchResult[]
): { merged: SearchResult[]; delta: SearchResult[] } {
  if (!incoming.length) {
    return { merged: existing, delta: [] };
  }

  const seen = new Set(existing.map(resultKey));
  const delta: SearchResult[] = [];
  const merged = [...existing];

  for (const item of incoming) {
    const key = resultKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
      delta.push(item);
    }
  }

  return { merged, delta };
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
  onBatch?: (merged: SearchResult[], delta: SearchResult[]) => void;
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
    const { merged: nextMerged, delta } = mergeUniqueResults(merged, filtered);
    merged = nextMerged;
    onBatch?.(merged, delta);
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
