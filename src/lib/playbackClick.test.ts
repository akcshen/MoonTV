import { keepPlayingOnVideoClick } from './playbackClick';

function createPlayer() {
  const calls: string[] = [];
  let onClick: (() => void) | null = null;
  const art = {
    toggle() {
      calls.push('toggle');
    },
    on(event: string, handler: () => void) {
      if (event === 'click') onClick = handler;
    },
  };
  keepPlayingOnVideoClick(art);
  return {
    calls,
    click: () => onClick?.(),
    toggle: () => art.toggle(),
  };
}

describe('keepPlayingOnVideoClick', () => {
  it('ignores the toggle that ArtPlayer fires synchronously on click', () => {
    const player = createPlayer();
    player.click();
    player.toggle();
    expect(player.calls).toEqual([]);
  });

  it('still toggles from the play button or space bar', () => {
    const player = createPlayer();
    player.toggle();
    expect(player.calls).toEqual(['toggle']);
  });

  it('does not swallow a later toggle after the click turn ends', async () => {
    const player = createPlayer();
    player.click();
    player.toggle();
    await Promise.resolve();
    player.toggle();
    expect(player.calls).toEqual(['toggle']);
  });
});
