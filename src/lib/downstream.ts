import { API_CONFIG, ApiSite, getConfig } from '@/lib/config';
import { SearchResult } from '@/lib/types';
import { cleanHtmlTags } from '@/lib/utils';

interface ApiSearchItem {
  vod_id: string;
  vod_name: string;
  vod_pic: string;
  vod_remarks?: string;
  vod_play_url?: string;
  vod_class?: string;
  vod_year?: string;
  vod_content?: string;
  vod_douban_id?: number;
  type_name?: string;
}

export interface SearchFromApiOptions {
  /** 浏览搜索：只拉第一页，并精简剧集地址，显著降低延迟与响应体积 */
  lite?: boolean;
}

function parseEpisodesFromPlayUrl(vodPlayUrl?: string): string[] {
  let episodes: string[] = [];
  if (!vodPlayUrl) return episodes;

  const m3u8Regex = /\$(https?:\/\/[^"'\s]+?\.m3u8)/g;
  const vod_play_url_array = vodPlayUrl.split('$$$');
  vod_play_url_array.forEach((url: string) => {
    const matches = url.match(m3u8Regex) || [];
    if (matches.length > episodes.length) {
      episodes = matches;
    }
  });

  return Array.from(new Set(episodes)).map((link: string) => {
    link = link.substring(1); // 去掉开头的 $
    const parenIndex = link.indexOf('(');
    return parenIndex > 0 ? link.substring(0, parenIndex) : link;
  });
}

function mapApiItemToResult(
  item: ApiSearchItem,
  apiSite: ApiSite,
  apiName: string,
  lite: boolean
): SearchResult {
  const episodes = parseEpisodesFromPlayUrl(item.vod_play_url);
  const episode_count = episodes.length;

  return {
    id: item.vod_id.toString(),
    title: item.vod_name.trim().replace(/\s+/g, ' '),
    poster: item.vod_pic,
    // lite：列表页只需集数，播放地址走 /api/detail
    episodes: lite ? [] : episodes,
    episode_count,
    source: apiSite.key,
    source_name: apiName,
    class: item.vod_class,
    year: item.vod_year ? item.vod_year.match(/\d{4}/)?.[0] || '' : 'unknown',
    desc: lite ? '' : cleanHtmlTags(item.vod_content || ''),
    type_name: item.type_name,
    douban_id: item.vod_douban_id,
  };
}

export async function searchFromApi(
  apiSite: ApiSite,
  query: string,
  options: SearchFromApiOptions = {}
): Promise<SearchResult[]> {
  const lite = options.lite === true;

  try {
    const apiBaseUrl = apiSite.api;
    const apiUrl =
      apiBaseUrl + API_CONFIG.search.path + encodeURIComponent(query);
    const apiName = apiSite.name;

    // 添加超时处理
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(apiUrl, {
      headers: API_CONFIG.search.headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    if (
      !data ||
      !data.list ||
      !Array.isArray(data.list) ||
      data.list.length === 0
    ) {
      return [];
    }
    // 处理第一页结果
    const results: SearchResult[] = data.list.map((item: ApiSearchItem) =>
      mapApiItemToResult(item, apiSite, apiName, lite)
    );

    // lite 模式只取第一页，优先返回结果
    if (lite) {
      return results;
    }

    const config = await getConfig();
    const MAX_SEARCH_PAGES: number = config.SiteConfig.SearchDownstreamMaxPage;

    // 获取总页数
    const pageCount = data.pagecount || 1;
    // 确定需要获取的额外页数
    const pagesToFetch = Math.min(pageCount - 1, MAX_SEARCH_PAGES - 1);

    // 如果有额外页数，获取更多页的结果
    if (pagesToFetch > 0) {
      const additionalPagePromises = [];

      for (let page = 2; page <= pagesToFetch + 1; page++) {
        const pageUrl =
          apiBaseUrl +
          API_CONFIG.search.pagePath
            .replace('{query}', encodeURIComponent(query))
            .replace('{page}', page.toString());

        const pagePromise = (async () => {
          try {
            const pageController = new AbortController();
            const pageTimeoutId = setTimeout(
              () => pageController.abort(),
              8000
            );

            const pageResponse = await fetch(pageUrl, {
              headers: API_CONFIG.search.headers,
              signal: pageController.signal,
            });

            clearTimeout(pageTimeoutId);

            if (!pageResponse.ok) return [];

            const pageData = await pageResponse.json();

            if (!pageData || !pageData.list || !Array.isArray(pageData.list))
              return [];

            return pageData.list.map((item: ApiSearchItem) =>
              mapApiItemToResult(item, apiSite, apiName, false)
            );
          } catch (error) {
            return [];
          }
        })();

        additionalPagePromises.push(pagePromise);
      }

      // 等待所有额外页的结果
      const additionalResults = await Promise.all(additionalPagePromises);

      // 合并所有页的结果
      additionalResults.forEach((pageResults) => {
        if (pageResults.length > 0) {
          results.push(...pageResults);
        }
      });
    }

    return results;
  } catch (error) {
    return [];
  }
}

// 匹配 m3u8 链接的正则
const M3U8_PATTERN = /(https?:\/\/[^"'\s]+?\.m3u8)/g;

/**
 * vod_play_url 可能包含多组播放源（$$$ 分隔），且第一组未必可播。
 * 例如电影天堂的 dytt 组是 /share/ 网页链接，dyttm3u8 组才是真正的流地址，
 * 所以按 m3u8 数量择优，全都没有 m3u8 时退回集数最多的一组。
 */
function pickPlayableEpisodes(vodPlayUrl?: string): string[] {
  if (!vodPlayUrl) return [];

  let best: string[] = [];
  let bestM3u8Count = -1;

  vodPlayUrl.split('$$$').forEach((group) => {
    const urls = group
      .split('#')
      .map((episode) => {
        const parts = episode.split('$');
        return parts.length > 1 ? parts[1] : '';
      })
      .filter((url) => url.startsWith('http://') || url.startsWith('https://'));

    const m3u8Count = urls.filter((url) => url.includes('.m3u8')).length;
    if (
      m3u8Count > bestM3u8Count ||
      (m3u8Count === bestM3u8Count && urls.length > best.length)
    ) {
      bestM3u8Count = m3u8Count;
      best = urls;
    }
  });

  return best;
}

export async function getDetailFromApi(
  apiSite: ApiSite,
  id: string
): Promise<SearchResult> {
  if (apiSite.detail) {
    // 详情页可能被防爬拦截（如电影天堂返回 "Verify Yourself" 验证页），
    // 此时标准接口通常仍可用，回退过去而不是返回空剧集
    try {
      const detail = await handleSpecialSourceDetail(id, apiSite);
      if (detail.episodes.length > 0) {
        return detail;
      }
    } catch {
      // 忽略，转由标准接口兜底
    }
  }

  return fetchDetailFromStandardApi(apiSite, id);
}

async function fetchDetailFromStandardApi(
  apiSite: ApiSite,
  id: string
): Promise<SearchResult> {
  const detailUrl = `${apiSite.api}${API_CONFIG.detail.path}${id}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(detailUrl, {
    headers: API_CONFIG.detail.headers,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`详情请求失败: ${response.status}`);
  }

  const data = await response.json();

  if (
    !data ||
    !data.list ||
    !Array.isArray(data.list) ||
    data.list.length === 0
  ) {
    throw new Error('获取到的详情内容无效');
  }

  const videoDetail = data.list[0];
  let episodes = pickPlayableEpisodes(videoDetail.vod_play_url);

  // 如果播放源为空，则尝试从内容中解析 m3u8
  if (episodes.length === 0 && videoDetail.vod_content) {
    const matches = videoDetail.vod_content.match(M3U8_PATTERN) || [];
    episodes = matches.map((link: string) => link.replace(/^\$/, ''));
  }

  return {
    id: id.toString(),
    title: videoDetail.vod_name,
    poster: videoDetail.vod_pic,
    episodes,
    episode_count: episodes.length,
    source: apiSite.key,
    source_name: apiSite.name,
    class: videoDetail.vod_class,
    year: videoDetail.vod_year
      ? videoDetail.vod_year.match(/\d{4}/)?.[0] || ''
      : 'unknown',
    desc: cleanHtmlTags(videoDetail.vod_content),
    type_name: videoDetail.type_name,
    douban_id: videoDetail.vod_douban_id,
  };
}

async function handleSpecialSourceDetail(
  id: string,
  apiSite: ApiSite
): Promise<SearchResult> {
  const detailUrl = `${apiSite.detail}/index.php/vod/detail/id/${id}.html`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(detailUrl, {
    headers: API_CONFIG.detail.headers,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(`详情页请求失败: ${response.status}`);
  }

  const html = await response.text();
  let matches: string[] = [];

  if (apiSite.key === 'ffzy') {
    const ffzyPattern =
      /\$(https?:\/\/[^"'\s]+?\/\d{8}\/\d+_[a-f0-9]+\/index\.m3u8)/g;
    matches = html.match(ffzyPattern) || [];
  }

  if (matches.length === 0) {
    const generalPattern = /\$(https?:\/\/[^"'\s]+?\.m3u8)/g;
    matches = html.match(generalPattern) || [];
  }

  // 去重并清理链接前缀
  matches = Array.from(new Set(matches)).map((link: string) => {
    link = link.substring(1); // 去掉开头的 $
    const parenIndex = link.indexOf('(');
    return parenIndex > 0 ? link.substring(0, parenIndex) : link;
  });

  // 提取标题
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  const titleText = titleMatch ? titleMatch[1].trim() : '';

  // 提取描述
  const descMatch = html.match(
    /<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/
  );
  const descText = descMatch ? cleanHtmlTags(descMatch[1]) : '';

  // 提取封面
  const coverMatch = html.match(/(https?:\/\/[^"'\s]+?\.jpg)/g);
  const coverUrl = coverMatch ? coverMatch[0].trim() : '';

  // 提取年份
  const yearMatch = html.match(/>(\d{4})</);
  const yearText = yearMatch ? yearMatch[1] : 'unknown';

  return {
    id,
    title: titleText,
    poster: coverUrl,
    episodes: matches,
    episode_count: matches.length,
    source: apiSite.key,
    source_name: apiSite.name,
    class: '',
    year: yearText,
    desc: descText,
    type_name: '',
    douban_id: 0,
  };
}
