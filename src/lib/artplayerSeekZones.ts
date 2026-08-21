/* eslint-disable @typescript-eslint/no-explicit-any */

/** 双击左右区域快进/快退秒数（B 站风格） */
export const DOUBLE_TAP_SEEK_SECONDS = 10;

type SeekZone = 'left' | 'center' | 'right';

type ArtplayerLike = {
  isLock: boolean;
  currentTime: number;
  duration: number;
  toggle: () => void;
  notice: { show: string };
};

function seekBySeconds(art: ArtplayerLike, delta: number) {
  const current = art.currentTime || 0;
  const duration = art.duration || 0;
  const next =
    delta < 0
      ? Math.max(0, current + delta)
      : Math.min(duration > 0 ? duration : current + delta, current + delta);
  art.currentTime = next;
  art.notice.show = delta < 0 ? `倒退 ${-delta} 秒` : `快进 ${delta} 秒`;
}

function createZoneClickHandler(zone: SeekZone, seekSeconds: number) {
  let lastClickAt = 0;
  let centerTimer: ReturnType<typeof setTimeout> | null = null;

  return function (this: ArtplayerLike, _component: unknown, event: Event) {
    if (this.isLock) return;
    event.preventDefault();
    event.stopPropagation();

    const dbClickTime = 300;
    const now = Date.now();
    const isDoubleClick = now - lastClickAt <= dbClickTime;

    if (zone === 'center') {
      if (isDoubleClick) {
        if (centerTimer) {
          clearTimeout(centerTimer);
          centerTimer = null;
        }
        lastClickAt = 0;
        return;
      }

      lastClickAt = now;
      if (centerTimer) clearTimeout(centerTimer);
      centerTimer = setTimeout(() => {
        if (lastClickAt === now) {
          this.toggle();
        }
        centerTimer = null;
        lastClickAt = 0;
      }, dbClickTime);
      return;
    }

    if (isDoubleClick) {
      lastClickAt = 0;
      if (zone === 'left') {
        seekBySeconds(this, -seekSeconds);
      } else {
        seekBySeconds(this, seekSeconds);
      }
    } else {
      lastClickAt = now;
    }
  };
}

const zoneLayerStyle = (
  left: string,
  width: string
): Partial<CSSStyleDeclaration> => ({
  position: 'absolute',
  left,
  top: '0',
  width,
  height: '100%',
  zIndex: '20',
});

/** ArtPlayer 三分区双击 seek 图层（桌面 + 移动） */
export function createDoubleTapSeekLayers(
  seekSeconds = DOUBLE_TAP_SEEK_SECONDS
) {
  return [
    {
      name: 'seek-left',
      html: '',
      style: zoneLayerStyle('0', '33.33%'),
      click: createZoneClickHandler('left', seekSeconds),
    },
    {
      name: 'seek-center',
      html: '',
      style: zoneLayerStyle('33.33%', '33.34%'),
      click: createZoneClickHandler('center', seekSeconds),
    },
    {
      name: 'seek-right',
      html: '',
      style: zoneLayerStyle('66.67%', '33.33%'),
      click: createZoneClickHandler('right', seekSeconds),
    },
  ];
}

/** 关闭 ArtPlayer 默认双击全屏 / 移动端双击播放，改由三分区手势接管 */
export function configureArtplayerDoubleTapSeek(Artplayer: any) {
  Artplayer.DBCLICK_FULLSCREEN = false;
  Artplayer.MOBILE_DBCLICK_PLAY = false;
  Artplayer.MOBILE_CLICK_PLAY = false;
}
