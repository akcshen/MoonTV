/**
 * 客户端视频下载工具：支持直链文件与 HLS(m3u8) 分片合并。
 * 受 CORS 限制时可通过 /api/proxy/video 拉取。
 */

export type DownloadProgress = {
  phase: 'playlist' | 'segments' | 'saving' | 'remux' | 'done' | 'error';
  current: number;
  total: number;
  message: string;
};

export type DownloadOptions = {
  url: string;
  filename: string;
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
  /** 优先直连；失败后再走代理 */
  useProxyFallback?: boolean;
};

const PROXY_PREFIX = '/api/proxy/video?url=';
const SEGMENT_CONCURRENCY = 3;
/** 单集分片上限，避免浏览器内存撑爆 */
const MAX_SEGMENTS = 800;

function report(
  onProgress: DownloadOptions['onProgress'],
  progress: DownloadProgress
) {
  onProgress?.(progress);
}

export function sanitizeDownloadFilename(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'video'
  );
}

function resolveUrl(base: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

function isProbablyHls(url: string): boolean {
  return /\.m3u8(\?|#|$)/i.test(url);
}

function isProbablyMediaFile(url: string): boolean {
  return /\.(mp4|mkv|webm|mov|m4v|flv|ts)(\?|#|$)/i.test(url);
}

async function fetchArrayBuffer(
  url: string,
  signal?: AbortSignal,
  viaProxy = false
): Promise<ArrayBuffer> {
  const target = viaProxy ? `${PROXY_PREFIX}${encodeURIComponent(url)}` : url;
  const res = await fetch(target, { signal, redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`请求失败 (${res.status})`);
  }
  return res.arrayBuffer();
}

async function fetchText(
  url: string,
  signal?: AbortSignal,
  viaProxy = false
): Promise<string> {
  const buf = await fetchArrayBuffer(url, signal, viaProxy);
  return new TextDecoder('utf-8').decode(buf);
}

async function fetchTextWithFallback(
  url: string,
  signal?: AbortSignal,
  useProxyFallback = true
): Promise<{ text: string; viaProxy: boolean }> {
  try {
    const text = await fetchText(url, signal, false);
    return { text, viaProxy: false };
  } catch (err) {
    if (!useProxyFallback) throw err;
    const text = await fetchText(url, signal, true);
    return { text, viaProxy: true };
  }
}

async function fetchBufferWithMode(
  url: string,
  signal: AbortSignal | undefined,
  viaProxy: boolean
): Promise<ArrayBuffer> {
  if (viaProxy) {
    return fetchArrayBuffer(url, signal, true);
  }
  try {
    return await fetchArrayBuffer(url, signal, false);
  } catch {
    return fetchArrayBuffer(url, signal, true);
  }
}

function parseM3u8SegmentUrls(playlist: string, playlistUrl: string): string[] {
  const lines = playlist.split(/\r?\n/);
  const segments: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    segments.push(resolveUrl(playlistUrl, line));
  }
  return segments;
}

function pickBestVariant(masterPlaylist: string, masterUrl: string): string {
  const lines = masterPlaylist.split(/\r?\n/);
  let bestBandwidth = -1;
  let bestUrl = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
    const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/i);
    const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;
    const next = lines[i + 1]?.trim();
    if (!next || next.startsWith('#')) continue;
    if (bandwidth >= bestBandwidth) {
      bestBandwidth = bandwidth;
      bestUrl = resolveUrl(masterUrl, next);
    }
  }

  if (!bestUrl) {
    throw new Error('无法解析多码率播放列表');
  }
  return bestUrl;
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 延迟释放，避免部分浏览器下载中断
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

function stripKnownExtension(name: string): string {
  return name.replace(/\.(mp4|mkv|webm|mov|m4v|flv|ts)$/i, '');
}

function withExtension(name: string, ext: string): string {
  const base = stripKnownExtension(name);
  return `${base}.${ext}`;
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('下载已取消', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('下载已取消', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** 浏览器端 TS → MP4 转封装（不重新编码） */
async function transmuxTsToMp4(
  tsData: ArrayBuffer | Uint8Array,
  signal?: AbortSignal
): Promise<Uint8Array> {
  if (signal?.aborted) {
    throw new DOMException('下载已取消', 'AbortError');
  }

  const muxjs = await import('mux.js');
  const Transmuxer = muxjs.mp4.Transmuxer;

  return new Promise((resolve, reject) => {
    const transmuxer = new Transmuxer();
    const chunks: Uint8Array[] = [];

    transmuxer.on('data', (segment) => {
      if (segment.initSegment) {
        chunks.push(segment.initSegment);
      }
      chunks.push(segment.data);
    });

    // 与 mux.js CLI 一致，避免字幕/ID3 时间偏移
    transmuxer.setBaseMediaDecodeTime(90_000);

    try {
      const input =
        tsData instanceof Uint8Array ? tsData : new Uint8Array(tsData);
      transmuxer.push(input);
      transmuxer.flush();

      if (chunks.length === 0) {
        reject(new Error('TS 转 MP4 失败：无有效媒体数据'));
        return;
      }
      resolve(concatUint8Arrays(chunks));
    } catch (err) {
      reject(err);
    }
  });
}

/** 保存 TS，并尝试额外保存同名的 MP4（转封装失败时仍保留 TS） */
async function saveTsAndMp4(
  tsBlob: Blob,
  filename: string,
  signal: AbortSignal | undefined,
  onProgress: DownloadOptions['onProgress']
) {
  const tsName = withExtension(filename, 'ts');
  triggerBrowserDownload(tsBlob, tsName);

  report(onProgress, {
    phase: 'remux',
    current: 0,
    total: 1,
    message: '正在转封装 MP4（保留 TS）...',
  });

  try {
    await delay(400, signal);
    const mp4Data = await transmuxTsToMp4(await tsBlob.arrayBuffer(), signal);
    const mp4Name = withExtension(filename, 'mp4');
    triggerBrowserDownload(new Blob([mp4Data], { type: 'video/mp4' }), mp4Name);
    report(onProgress, {
      phase: 'remux',
      current: 1,
      total: 1,
      message: '已保存 TS 与 MP4',
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    report(onProgress, {
      phase: 'remux',
      current: 1,
      total: 1,
      message: '已保存 TS（MP4 转封装失败）',
    });
  }
}

async function downloadDirectFile(
  url: string,
  filename: string,
  signal: AbortSignal | undefined,
  onProgress: DownloadOptions['onProgress'],
  useProxyFallback: boolean
) {
  report(onProgress, {
    phase: 'segments',
    current: 0,
    total: 1,
    message: '正在下载视频文件...',
  });

  let buffer: ArrayBuffer;
  try {
    buffer = await fetchArrayBuffer(url, signal, false);
  } catch (err) {
    if (!useProxyFallback) throw err;
    buffer = await fetchArrayBuffer(url, signal, true);
  }

  report(onProgress, {
    phase: 'saving',
    current: 1,
    total: 1,
    message: '正在保存...',
  });

  const extMatch = url.match(/\.(mp4|mkv|webm|mov|m4v|flv|ts)(\?|#|$)/i);
  const ext = extMatch?.[1]?.toLowerCase() || 'mp4';

  if (ext === 'ts') {
    await saveTsAndMp4(new Blob([buffer]), filename, signal, onProgress);
    return;
  }

  const finalName = filename.toLowerCase().endsWith(`.${ext}`)
    ? filename
    : `${filename}.${ext}`;

  triggerBrowserDownload(new Blob([buffer]), finalName);
}

async function downloadHls(
  url: string,
  filename: string,
  signal: AbortSignal | undefined,
  onProgress: DownloadOptions['onProgress'],
  useProxyFallback: boolean
) {
  report(onProgress, {
    phase: 'playlist',
    current: 0,
    total: 0,
    message: '正在获取播放列表...',
  });

  let { text: playlist, viaProxy } = await fetchTextWithFallback(
    url,
    signal,
    useProxyFallback
  );
  let mediaPlaylistUrl = url;

  if (playlist.includes('#EXT-X-STREAM-INF')) {
    mediaPlaylistUrl = pickBestVariant(playlist, url);
    const media = await fetchTextWithFallback(
      mediaPlaylistUrl,
      signal,
      useProxyFallback
    );
    playlist = media.text;
    viaProxy = viaProxy || media.viaProxy;
  }

  if (!playlist.includes('#EXTINF') && !playlist.includes('#EXT-X-MAP')) {
    throw new Error('播放列表无效，无法下载');
  }

  const segments = parseM3u8SegmentUrls(playlist, mediaPlaylistUrl);
  if (segments.length === 0) {
    throw new Error('未找到可下载的视频分片');
  }
  if (segments.length > MAX_SEGMENTS) {
    throw new Error(`分片过多（${segments.length}），请换源或使用外部下载工具`);
  }

  // 处理 init segment（fMP4）
  const mapMatch = playlist.match(/#EXT-X-MAP:URI="([^"]+)"/i);
  const initUrl = mapMatch ? resolveUrl(mediaPlaylistUrl, mapMatch[1]) : null;

  const total = segments.length + (initUrl ? 1 : 0);
  const parts: ArrayBuffer[] = new Array(total);
  let completed = 0;

  if (initUrl) {
    report(onProgress, {
      phase: 'segments',
      current: 0,
      total,
      message: '正在下载初始化分片...',
    });
    parts[0] = await fetchBufferWithMode(initUrl, signal, viaProxy);
    completed += 1;
    report(onProgress, {
      phase: 'segments',
      current: completed,
      total,
      message: `正在下载分片 ${completed}/${total}`,
    });
  }

  let cursor = 0;
  const offset = initUrl ? 1 : 0;
  const workers = Array.from(
    { length: Math.min(SEGMENT_CONCURRENCY, segments.length) },
    async () => {
      while (!signal?.aborted) {
        const index = cursor++;
        if (index >= segments.length) return;
        const buf = await fetchBufferWithMode(
          segments[index],
          signal,
          viaProxy
        );
        parts[offset + index] = buf;
        completed += 1;
        report(onProgress, {
          phase: 'segments',
          current: completed,
          total,
          message: `正在下载分片 ${completed}/${total}`,
        });
      }
    }
  );

  await Promise.all(workers);
  if (signal?.aborted) {
    throw new DOMException('下载已取消', 'AbortError');
  }

  report(onProgress, {
    phase: 'saving',
    current: total,
    total,
    message: '正在合并并保存...',
  });

  // fMP4 init + m4s → mp4；纯 TS 分片 → ts + mp4
  const isFmp4 = Boolean(initUrl);
  if (isFmp4) {
    const finalName = filename.toLowerCase().endsWith('.mp4')
      ? filename
      : withExtension(filename, 'mp4');
    triggerBrowserDownload(new Blob(parts), finalName);
    return;
  }

  await saveTsAndMp4(new Blob(parts), filename, signal, onProgress);
}

/**
 * 下载视频到本地。
 * - HLS 纯 TS 分片：同时保存 .ts 与转封装后的 .mp4
 * - HLS fMP4 源：仅 .mp4
 * - 直链 .ts：同时保存 .ts 与 .mp4
 * - 直链 .mp4 等：按原格式保存
 */
export async function downloadVideoToLocal(
  options: DownloadOptions
): Promise<void> {
  const {
    url,
    filename,
    signal,
    onProgress,
    useProxyFallback = true,
  } = options;

  if (!url) {
    throw new Error('当前没有可下载的视频地址');
  }

  const safeName = sanitizeDownloadFilename(filename);

  try {
    if (isProbablyHls(url)) {
      await downloadHls(url, safeName, signal, onProgress, useProxyFallback);
    } else if (isProbablyMediaFile(url)) {
      await downloadDirectFile(
        url,
        safeName,
        signal,
        onProgress,
        useProxyFallback
      );
    } else {
      // 未知类型：先当 HLS，失败再当直链
      try {
        await downloadHls(url, safeName, signal, onProgress, useProxyFallback);
      } catch (hlsErr) {
        if ((hlsErr as Error)?.name === 'AbortError') throw hlsErr;
        await downloadDirectFile(
          url,
          safeName,
          signal,
          onProgress,
          useProxyFallback
        );
      }
    }

    report(onProgress, {
      phase: 'done',
      current: 1,
      total: 1,
      message: '下载完成',
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      report(onProgress, {
        phase: 'error',
        current: 0,
        total: 0,
        message: '下载已取消',
      });
      throw err;
    }
    const message = err instanceof Error ? err.message : '下载失败';
    report(onProgress, {
      phase: 'error',
      current: 0,
      total: 0,
      message,
    });
    throw err;
  }
}

/** 复制播放地址，供外部下载工具使用 */
export async function copyVideoUrl(url: string): Promise<void> {
  if (!url) throw new Error('当前没有可复制的地址');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = url;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}
