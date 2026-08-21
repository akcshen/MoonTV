import { API_CONFIG, ApiSite } from '@/lib/config';
import { SHORT_DRAMA_GENRES } from '@/lib/shortdramaGenres';
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
/**
 * 「全部」时单站最多请求的分类数。
 * 有的站父分类是空壳（极速资源 t=38 返回 0，内容全在子分类里），
 * 有的站父分类不完整（暴风资源父 12183 条、子分类合计 26053 条），
 * 所以父子都要取，但要限制请求数量。
 */
const MAX_CATEGORIES_PER_SITE = 4;

const CATEGORY_LIST_TIMEOUT = 5000;
const VIDEO_LIST_TIMEOUT = 8000;

interface ApiCategory {
  type_id: number | string;
  type_name: string;
  type_pid?: number | string;
}

export interface ShortDramaCategories {
  /** 「全部」使用的分类 id（父分类 + 子分类） */
  allIds: string[];
  /** 题材 label → 该站对应的分类 id */
  genreIds: Record<string, string[]>;
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
  { categories: ShortDramaCategories; expiresAt: number }
>();

/** 擦边/福利等分类，即便挂在短剧下也不展示 */
function isBlockedCategory(name: string): boolean {
  if (EXCLUDED_CATEGORY_WORDS.some((word) => name.includes(word))) return true;
  return yellowWords.some((word) => name.includes(word));
}

/** 顶级短剧分类：名字含「短剧」且未被屏蔽 */
function isShortDramaRootCategory(name: string): boolean {
  if (!SHORT_DRAMA_KEYWORDS.some((word) => name.includes(word))) return false;
  return !isBlockedCategory(name);
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

function findGenreByAlias(categoryName: string): string | null {
  const normalized = categoryName.trim();
  const matched = SHORT_DRAMA_GENRES.find((genre) =>
    genre.aliases.some((alias) => alias === normalized)
  );
  return matched?.label ?? null;
}

/**
 * 探测资源站的短剧分类。各站分类 id 完全不一致（36/46/54/58…），
 * 且题材子分类的名字不含「短剧」，只能靠 type_pid 关联。
 */
export async function getShortDramaCategories(
  apiSite: ApiSite
): Promise<ShortDramaCategories> {
  const cached = categoryCache.get(apiSite.key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.categories;
  }

  const data = await fetchJson(`${apiSite.api}?ac=list`, CATEGORY_LIST_TIMEOUT);
  const classes = (data?.class as ApiCategory[] | undefined) || [];

  const roots = classes.filter((item) =>
    isShortDramaRootCategory(String(item?.type_name ?? ''))
  );
  const rootIds = new Set(roots.map((item) => String(item.type_id)));

  // 题材子分类名字里不含「短剧」，只能靠挂在短剧分类下识别
  const children = classes.filter(
    (item) =>
      item?.type_pid != null &&
      rootIds.has(String(item.type_pid)) &&
      !rootIds.has(String(item.type_id)) &&
      !isBlockedCategory(String(item?.type_name ?? ''))
  );

  const genreIds: Record<string, string[]> = {};
  children.forEach((item) => {
    const genre = findGenreByAlias(String(item.type_name ?? ''));
    if (!genre) return;
    genreIds[genre] = [...(genreIds[genre] || []), String(item.type_id)];
  });

  const categories: ShortDramaCategories = {
    allIds: [
      ...roots.map((item) => String(item.type_id)),
      ...children.map((item) => String(item.type_id)),
    ].slice(0, MAX_CATEGORIES_PER_SITE),
    genreIds,
  };

  categoryCache.set(apiSite.key, {
    categories,
    expiresAt: Date.now() + CATEGORY_CACHE_TTL,
  });
  return categories;
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

/**
 * 拉取单个资源站某一页的短剧。
 * genre 为空表示「全部」；返回空数组表示该站没有对应内容或请求失败。
 */
export async function fetchShortDramaFromSite(
  apiSite: ApiSite,
  page: number,
  genre?: string
): Promise<ShortDramaPage> {
  const categories = await getShortDramaCategories(apiSite);
  const typeIds = genre ? categories.genreIds[genre] || [] : categories.allIds;
  if (typeIds.length === 0) {
    return { items: [], hasMore: false };
  }

  // t 参数不支持多值（实测 t=46,47 与 t=46 结果相同），逐个分类请求后合并
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
    if ((Number(data.pagecount) || 0) > page) hasMore = true;

    list.forEach((item) => {
      if (!item?.vod_id || !item?.vod_name) return;
      // 已按短剧分类 id 请求，这里只需挡掉擦边内容
      if (isBlockedCategory(String(item.type_name || ''))) return;
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
