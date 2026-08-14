import { NextResponse } from 'next/server';

import { getCacheTime, getConfig } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { yellowWords } from '@/lib/yellow';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  // lite=1：浏览搜索（首屏更快、体积更小）；播放页聚合源请勿传 lite
  const lite = searchParams.get('lite') === '1';
  // source：单源搜索，供客户端渐进式合并结果
  const sourceKey = searchParams.get('source');

  if (!query) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}, stale-while-revalidate=60`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}, stale-while-revalidate=60`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}, stale-while-revalidate=60`,
        },
      }
    );
  }

  const config = await getConfig();
  let apiSites = config.SourceConfig.filter((site) => !site.disabled);
  if (sourceKey) {
    apiSites = apiSites.filter((site) => site.key === sourceKey);
    if (apiSites.length === 0) {
      return NextResponse.json(
        { error: `未找到指定的视频源: ${sourceKey}`, results: [] },
        { status: 404 }
      );
    }
  }
  const searchPromises = apiSites.map((site) =>
    searchFromApi(site, query, { lite })
  );

  try {
    // allSettled：单个源异常不影响整体返回
    const settled = await Promise.allSettled(searchPromises);
    let flattenedResults = settled.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : []
    );
    if (!config.SiteConfig.DisableYellowFilter) {
      flattenedResults = flattenedResults.filter((result) => {
        const typeName = result.type_name || '';
        return !yellowWords.some((word: string) => typeName.includes(word));
      });
    }
    const cacheTime = await getCacheTime();
    // 浏览搜索结果更容易过期，使用较短 CDN TTL + SWR
    const listCacheTime = lite ? Math.min(cacheTime, 600) : cacheTime;

    return NextResponse.json(
      { results: flattenedResults },
      {
        headers: {
          'Cache-Control': `public, max-age=${listCacheTime}, s-maxage=${listCacheTime}, stale-while-revalidate=120`,
          'CDN-Cache-Control': `public, s-maxage=${listCacheTime}, stale-while-revalidate=120`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${listCacheTime}, stale-while-revalidate=120`,
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
