import { NextResponse } from 'next/server';

import { getCacheTime, getConfig } from '@/lib/config';
import {
  DEFAULT_SHORT_DRAMA_SOURCE_LIMIT,
  fetchShortDramaFromSite,
  getShortDramaTypeIds,
  mergeShortDramaItems,
  ShortDramaItem,
} from '@/lib/shortdrama';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const sourceKey = searchParams.get('source');

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

  try {
    // 先探测哪些源有短剧分类（结果带缓存），再只向这些源取数
    const discovered = await Promise.allSettled(
      apiSites.map(async (site) => ({
        site,
        typeIds: await getShortDramaTypeIds(site),
      }))
    );

    const sitesWithShortDrama = discovered
      .filter(
        (
          result
        ): result is PromiseFulfilledResult<{
          site: (typeof apiSites)[number];
          typeIds: string[];
        }> => result.status === 'fulfilled' && result.value.typeIds.length > 0
      )
      .map((result) => result.value.site)
      .slice(0, DEFAULT_SHORT_DRAMA_SOURCE_LIMIT);

    if (sitesWithShortDrama.length === 0) {
      const cacheTime = await getCacheTime();
      return NextResponse.json(
        { results: [], hasMore: false },
        {
          headers: {
            'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
          },
        }
      );
    }

    const settled = await Promise.allSettled(
      sitesWithShortDrama.map((site) => fetchShortDramaFromSite(site, page))
    );

    const groups: ShortDramaItem[][] = [];
    let hasMore = false;
    settled.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      groups.push(result.value.items);
      if (result.value.hasMore) hasMore = true;
    });

    const results = mergeShortDramaItems(groups);

    // 短剧更新频繁，用较短的 CDN TTL
    const cacheTime = Math.min(await getCacheTime(), 600);
    return NextResponse.json(
      { results, hasMore },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}, stale-while-revalidate=120`,
          'CDN-Cache-Control': `public, s-maxage=${cacheTime}, stale-while-revalidate=120`,
          'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}, stale-while-revalidate=120`,
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: '获取短剧失败' }, { status: 500 });
  }
}
