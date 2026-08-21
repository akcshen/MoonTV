import { NextResponse } from 'next/server';

export const runtime = 'edge';

const MAX_WIDTH = 800;
const MIN_WIDTH = 50;
const IMAGE_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
};

type CfImageFetchInit = RequestInit & {
  cf?: {
    image: {
      width: number;
      fit: 'scale-down';
    };
  };
};

function parseWidth(raw: string | null): number {
  if (!raw) return 0;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return 0;
  return Math.min(MAX_WIDTH, parsed);
}

/** 豆瓣等 CDN 支持通过路径切换尺寸，Edge 无 sharp 时的轻量缩图 */
function optimizeUpstreamUrl(url: string, width: number): string {
  if (width <= 0) return url;

  try {
    const { hostname } = new URL(url);
    if (!hostname.includes('doubanio.com')) return url;

    if (width <= 360) {
      return url
        .replace('/l_ratio_poster/', '/s_ratio_poster/')
        .replace('/m_ratio_poster/', '/s_ratio_poster/');
    }
    if (width <= 640) {
      return url.replace('/l_ratio_poster/', '/m_ratio_poster/');
    }
  } catch {
    /* ignore malformed url */
  }

  return url;
}

function getRefererForUrl(imageUrl: string): string | undefined {
  try {
    const { hostname } = new URL(imageUrl);
    if (hostname.includes('douban')) {
      return 'https://movie.douban.com/';
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function buildFetchInit(upstreamUrl: string, width: number): CfImageFetchInit {
  const referer = getRefererForUrl(upstreamUrl);
  const init: CfImageFetchInit = {
    headers: {
      ...IMAGE_FETCH_HEADERS,
      ...(referer ? { Referer: referer } : {}),
    },
  };

  // Cloudflare Workers/Pages 上可用 cf.image 服务端缩图
  if (width >= MIN_WIDTH) {
    init.cf = {
      image: {
        width,
        fit: 'scale-down',
      },
    };
  }

  return init;
}

// OrionTV 兼容接口
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');
  const width = parseWidth(searchParams.get('w'));

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
  }

  try {
    const upstreamUrl = optimizeUpstreamUrl(imageUrl, width);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const imageResponse = await fetch(upstreamUrl, {
      ...buildFetchInit(upstreamUrl, width),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: imageResponse.statusText },
        { status: imageResponse.status }
      );
    }

    const contentType = imageResponse.headers.get('content-type');

    if (!imageResponse.body) {
      return NextResponse.json(
        { error: 'Image response has no body' },
        { status: 500 }
      );
    }

    const headers = new Headers();
    if (contentType) {
      headers.set('Content-Type', contentType);
    }

    headers.set('Cache-Control', 'public, max-age=15720000, s-maxage=15720000');
    headers.set('CDN-Cache-Control', 'public, s-maxage=15720000');
    headers.set('Vercel-CDN-Cache-Control', 'public, s-maxage=15720000');
    if (width > 0) {
      headers.set('Vary', 'Accept');
    }

    return new Response(imageResponse.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error fetching image' },
      { status: 500 }
    );
  }
}
