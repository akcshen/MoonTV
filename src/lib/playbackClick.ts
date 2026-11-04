type TogglePlayer = {
  toggle: () => void;
  on: (event: string, handler: () => void) => void;
};

/**
 * ArtPlayer 在桌面端会在视频的 click 事件里立刻 toggle。
 * 单击画面只用来显示控制栏，播放/暂停留给播放按钮和空格键。
 * 移动端双击仍会走到 toggle，这里不会拦住。
 */
export function keepPlayingOnVideoClick(art: TogglePlayer): void {
  const nativeToggle = art.toggle.bind(art);
  let suppressNextToggle = false;

  art.toggle = () => {
    if (suppressNextToggle) {
      suppressNextToggle = false;
      return;
    }
    nativeToggle();
  };

  art.on('click', () => {
    // click 回调里同步调用的那一次 toggle 来自单击画面
    suppressNextToggle = true;
    queueMicrotask(() => {
      suppressNextToggle = false;
    });
  });
}
