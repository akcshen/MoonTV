import { keepPlayingOnVideoClick } from './playbackClick';

function createPlayer() {
  const video = document.createElement('video');
  document.body.appendChild(video);
  const calls: string[] = [];
  let fullscreen = false;
  const art = {
    template: { $video: video },
    paused: false,
    isLock: false,
    play() {
      calls.push('play');
      this.paused = false;
    },
    pause() {
      calls.push('pause');
      this.paused = true;
    },
    get fullscreen() {
      return fullscreen;
    },
    set fullscreen(value: boolean) {
      fullscreen = value;
      calls.push(value ? 'enter-fullscreen' : 'exit-fullscreen');
    },
  };
  video.addEventListener('click', () => {
    calls.push('artplayer');
  });
  keepPlayingOnVideoClick(art);
  return { video, calls, art };
}

function click(video: HTMLVideoElement) {
  video.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('keepPlayingOnVideoClick', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('stops a single click from reaching ArtPlayer toggle', () => {
    const { video, calls } = createPlayer();
    click(video);
    expect(calls).toEqual([]);
  });

  it('turns a second desktop click into fullscreen instead of pause', () => {
    const { video, calls } = createPlayer();
    click(video);
    click(video);
    expect(calls).toEqual(['enter-fullscreen']);
  });

  it('does nothing when the player has no video element yet', () => {
    expect(() =>
      keepPlayingOnVideoClick({
        play() {
          /* empty */
        },
        pause() {
          /* empty */
        },
        fullscreen: false,
      })
    ).not.toThrow();
  });
});
