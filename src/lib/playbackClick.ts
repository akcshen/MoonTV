const DBCLICK_MS = 300;

type ClickPlayer = {
  template?: { $video?: HTMLVideoElement | null };
  video?: HTMLVideoElement | null;
  paused?: boolean;
  isLock?: boolean;
  play: () => void;
  pause: () => void;
  fullscreen: boolean;
};

/** 与 ArtPlayer 的 isMobile 判断保持一致，避免桌面/手机双击行为对不上。 */
function isArtMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOS =
    /iPad|iPhone|iPod/i.test(ua) &&
    !(window as Window & { MSStream?: unknown }).MSStream;
  const iPadOS = ua.includes('Macintosh') && navigator.maxTouchPoints >= 1;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
    iOS ||
    iPadOS
  );
}

/**
 * ArtPlayer 把 toggle 定义成不可写属性，桌面端单击视频会立刻暂停。
 * 在捕获阶段吃掉这次 click，单击只留给控制栏；双击仍按原逻辑处理。
 */
export function keepPlayingOnVideoClick(art: ClickPlayer): void {
  const video = art.template?.$video || art.video;
  if (!video) return;

  let stamps: number[] = [];
  video.addEventListener(
    'click',
    (event) => {
      event.stopImmediatePropagation();
      const now = Date.now();
      stamps = stamps.filter((time) => now - time <= DBCLICK_MS);
      stamps.push(now);
      if (stamps.length < 2) return;
      stamps = [];

      if (isArtMobile()) {
        if (art.isLock) return;
        if (art.paused) art.play();
        else art.pause();
        return;
      }

      art.fullscreen = !art.fullscreen;
    },
    true
  );
}
