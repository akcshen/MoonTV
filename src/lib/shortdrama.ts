import { API_CONFIG, ApiSite } from '@/lib/config';
import { SearchResult } from '@/lib/types';
import { cleanHtmlTags } from '@/lib/utils';
import { yellowWords } from '@/lib/yellow';

/** 资源站分类名命中这些词即视为短剧栏目 */
const SHORT_DRAMA_KEYWORDS = ['短剧'];

/**
 * 命中短剧关键字但仍需排除的分类。
 * 各站普遍存在「擦边短剧」这类分类，不适合出现在栏目里。
 */
const EXCLUDED_CATEGORY_WORDS = [
  '擦边',
  '福利',
  '伦理',
  '写真',
  '成人',
  '情色',
  '无码',
  '有码',
];

/** 分类发现结果的缓存时长 */
const CATEGORY_CACHE_TTL = 6 * 60 * 60 * 1000;
/** 单次聚合最多使用的资源站数量，避免请求过多拖慢首屏 */
export const DEFAULT_SHORT_DRAMA_SOURCE_LIMIT = 6;

const CATEGORY_LIST_TIMEOUT = 5000;
const VIDEO_LIST_TIMEOUT = 8000;

interface ApiCategory {
  type_id: number | string;
  type_name: string;
}

interface ApiVideoItem {
  vod_id: string | number;
  vod_name: string;
  vod_pic?: string;
  vod_remarks?: string;
  vod_play_url?: string;
  vod_class?: string;
  vod_year?: string;
  vod_content?: string;
  vod_douban_id?: number;
  vod_time?: string;
  type_name?: string;
}

export interface ShortDramaItem extends SearchResult {
  episode_count: number;
  /** 资源站的更新时间，用于跨源合并后排序 */
  update_time: string;
  /** 「已完结」「更新至 12 集」等状态文案 */
  remarks: string;
}

export interface ShortDramaPage {
  items: ShortDramaItem[];
  hasMore: boolean;
}

const categoryCache = new Map<
  string,
  { typeIds: string[]; expiresAt: number }
>();

function isShortDramaCategory(name: string): boolean {
  if (!SHORT_DRAMA_KEYWORDS.some((word) => name.includes(word))) return false;
  if (EXCLUDED_CATEGORY_WORDS.some((word) => name.includes(word))) return false;
  return !yellowWords.some((word) => name.includes(word));
}

async function fetchJson(
  url: string,
  timeout: number
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers: API_CONFIG.search.headers,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    // 失效的资源站会返回 HTML 首页而非 JSON
    const text = await response.text();
    if (!text.trimStart().startsWith('{')) return null;
    return JSON.parse(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 探测资源站的短剧分类 id。各站分类 id 不一致，只能动态发现 */
export async function getShortDramaTypeIds(
  apiSite: ApiSite
): Promise<string[]> {
  const cached = categoryCache.get(apiSite.key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.typeIds;
  }

  const data = await fetchJson(`${apiSite.api}?ac=list`, CATEGORY_LIST_TIMEOUT);
  const classes = (data?.class as ApiCategory[] | undefined) || [];
  const typeIds = classes
    .filter((item) => isShortDramaCategory(String(item?.type_name ?? '')))
    .map((item) => String(item.type_id));

  categoryCache.set(apiSite.key, {
    typeIds,
    expiresAt: Date.now() + CATEGORY_CACHE_TTL,
  });
  return typeIds;
}

function parseEpisodeCount(vodPlayUrl?: string): number {
  if (!vodPlayUrl) return 0;
  // 多个播放源以 $$$ 分隔，取集数最多的一组
  return vodPlayUrl.split('$$$').reduce((max, source) => {
    const count = (source.match(/\.m3u8/g) || []).length;
    return count > max ? count : max;
  }, 0);
}

function mapToShortDramaItem(
  item: ApiVideoItem,
  apiSite: ApiSite
): ShortDramaItem {
  return {
    id: String(item.vod_id),
    title: (item.vod_name || '').trim().replace(/\s+/g, ' '),
    poster: item.vod_pic || '',
    // 列表页只需要集数，播放地址由播放页经 /api/detail 获取
    episodes: [],
    episode_count: parseEpisodeCount(item.vod_play_url),
    source: apiSite.key,
    source_name: apiSite.name,
    class: item.vod_class,
    year: item.vod_year ? item.vod_year.match(/\d{4}/)?.[0] || '' : 'unknown',
    desc: cleanHtmlTags(item.vod_content || ''),
    type_name: item.type_name,
    douban_id: item.vod_douban_id,
    update_time: item.vod_time || '',
    remarks: item.vod_remarks || '',
  };
}

/** 拉取单个资源站某一页的短剧。返回空数组表示该站没有短剧或请求失败 */
export async function fetchShortDramaFromSite(
  apiSite: ApiSite,
  page: number
): Promise<ShortDramaPage> {
  const typeIds = await getShortDramaTypeIds(apiSite);
  if (typeIds.length === 0) {
    return { items: [], hasMore: false };
  }

  // t 参数不支持多值，逐个分类请求后合并
  const responses = await Promise.all(
    typeIds.map((typeId) =>
      fetchJson(
        `${apiSite.api}?ac=videolist&t=${encodeURIComponent(
          typeId
        )}&pg=${page}`,
        VIDEO_LIST_TIMEOUT
      )
    )
  );

  const items: ShortDramaItem[] = [];
  let hasMore = false;

  responses.forEach((data) => {
    if (!data) return;
    const list = (data.list as ApiVideoItem[] | undefined) || [];
    const pageCount = Number(data.pagecount) || 0;
    if (pageCount > page) hasMore = true;

    list.forEach((item) => {
      if (!item?.vod_id || !item?.vod_name) return;
      const typeName = String(item.type_name || '');
      if (typeName && !isShortDramaCategory(typeName)) return;
      items.push(mapToShortDramaItem(item, apiSite));
    });
  });

  return { items, hasMore };
}

function compareByRecency(a: ShortDramaItem, b: ShortDramaItem): number {
  if (a.update_time && b.update_time) {
    return b.update_time.localeCompare(a.update_time);
  }
  return b.episode_count - a.episode_count;
}

/**
 * 跨源合并：同名短剧只保留集数最多的一条。
 * 各源内部按更新时间倒序，再轮流取用——否则某个源刚好批量更新时会独占整个首屏。
 */
export function mergeShortDramaItems(
  groups: ShortDramaItem[][]
): ShortDramaItem[] {
  const byTitle = new Map<string, ShortDramaItem>();
  groups.flat().forEach((item) => {
    if (!item.title) return;
    const key = item.title.toLowerCase();
    const existing = byTitle.get(key);
    if (!existing || item.episode_count > existing.episode_count) {
      byTitle.set(key, item);
    }
  });

  const bySource = new Map<string, ShortDramaItem[]>();
  byTitle.forEach((item) => {
    const list = bySource.get(item.source);
    if (list) list.push(item);
    else bySource.set(item.source, [item]);
  });

  const queues = Array.from(bySource.values());
  queues.forEach((queue) => queue.sort(compareByRecency));

  const merged: ShortDramaItem[] = [];
  const maxLength = queues.reduce(
    (max, queue) => Math.max(max, queue.length),
    0
  );
  for (let index = 0; index < maxLength; index++) {
    queues.forEach((queue) => {
      if (index < queue.length) merged.push(queue[index]);
    });
  }
  return merged;
}
