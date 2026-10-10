/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import { createAdSkipHlsLoader } from '@/lib/hlsAdLoader';
import { getHlsPlaybackOptions } from '@/lib/hlsPlayback';

/** 保证 video 上只有一个匹配的 source，并允许 AirPlay / Cast。 */
export function ensureVideoSource(
  video: HTMLVideoElement | null,
  url: string
): void {
  if (!video || !url) return;
  const sources = Array.from(video.getElementsByTagName('source'));
  const existed = sources.some((s) => s.src === url);
  if (!existed) {
    sources.forEach((s) => s.remove());
    const sourceEl = document.createElement('source');
    sourceEl.src = url;
    video.appendChild(sourceEl);
  }

  video.disableRemotePlayback = false;
  if (video.hasAttribute('disableRemotePlayback')) {
    video.removeAttribute('disableRemotePlayback');
  }
}

export interface AttachHlsPlaybackOptions {
  Hls: any;
  video: HTMLVideoElement;
  url: string;
  /** 为 true 时挂实验性去广告 loader，默认调用方应传 false。 */
  blockAds: boolean;
  /** 大于 0 时作为 hls.js startPosition，并在清单解析后 startLoad。 */
  startPosition: number;
  onLevelSwitched?: (hls: any) => void;
  onFragLoaded?: (hls: any) => void;
  /** BUFFER_STALLED / BUFFER_SEEK_OVER_HOLE。是否动作由调用方决定。 */
  onStall?: (hls: any) => void;
  onFatal?: (hls: any, data: any) => void;
}

/** 创建 HLS 实例、挂到 video 上，并转发清晰度 / 卡顿 / 致命错误。 */
export function attachHlsPlayback(options: AttachHlsPlaybackOptions): any {
  const { Hls, video, url, blockAds, startPosition } = options;

  if (video.hls) {
    video.hls.destroy();
  }

  const hls = new Hls({
    ...getHlsPlaybackOptions(),
    startPosition: startPosition > 0 ? startPosition : -1,
    loader: blockAds ? createAdSkipHlsLoader(Hls) : Hls.DefaultConfig.loader,
  });

  hls.loadSource(url);
  hls.attachMedia(video);
  video.hls = hls;

  if (startPosition > 0) {
    hls.on(Hls.Events.MANIFEST_PARSED, function () {
      try {
        hls.startLoad(startPosition);
      } catch (err) {
        console.warn('HLS startLoad 恢复进度失败:', err);
      }
    });
  }

  ensureVideoSource(video, url);

  hls.on(Hls.Events.LEVEL_SWITCHED, function () {
    options.onLevelSwitched?.(hls);
  });
  hls.on(Hls.Events.FRAG_LOADED, function () {
    options.onFragLoaded?.(hls);
  });
  hls.on(Hls.Events.ERROR, function (_event: any, data: any) {
    if (
      data?.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
      data?.details === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE
    ) {
      options.onStall?.(hls);
      return;
    }
    if (data?.fatal) {
      options.onFatal?.(hls, data);
    }
  });

  return hls;
}
