import { NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * 视频/分片代理：供播放页下载在浏览器 CORS 受限时回退使用。
 * 仅允许 http(s)，带超时，不做长期缓存。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json(
      { error: 'Unsupported protocol' },
      { status: 400 }
    );
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const upstream = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept: '*/*',
      },
    });

    clearTimeout(timeoutId);

    if (!upstream.ok) {
      return NextResponse.json(
        { error: upstream.statusText || 'Upstream error' },
        { status: upstream.status }
      );
    }

    if (!upstream.body) {
      return NextResponse.json({ error: 'Empty body' }, { status: 502 });
    }

    const headers = new Headers();
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) headers.set('Content-Length', contentLength);

    headers.set('Cache-Control', 'no-store');
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(upstream.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Proxy timeout'
        : 'Proxy fetch failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
