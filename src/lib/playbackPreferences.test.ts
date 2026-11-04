import {
  DEFAULT_PLAYBACK_RATE,
  DEFAULT_PLAYBACK_VOLUME,
  PLAYBACK_RATE_KEY,
  PLAYBACK_VOLUME_KEY,
  readPlaybackRate,
  readPlaybackVolume,
  writePlaybackRate,
  writePlaybackVolume,
} from './playbackPreferences';

describe('playback volume and rate preferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('uses the original defaults when nothing is saved', () => {
    expect(readPlaybackVolume()).toBe(DEFAULT_PLAYBACK_VOLUME);
    expect(readPlaybackRate()).toBe(DEFAULT_PLAYBACK_RATE);
  });

  it('remembers a volume and a playback rate', () => {
    writePlaybackVolume(0.35);
    writePlaybackRate(1.5);
    expect(readPlaybackVolume()).toBe(0.35);
    expect(readPlaybackRate()).toBe(1.5);
    expect(window.localStorage.getItem(PLAYBACK_VOLUME_KEY)).toBe('0.35');
    expect(window.localStorage.getItem(PLAYBACK_RATE_KEY)).toBe('1.5');
  });

  it('clamps out-of-range values', () => {
    writePlaybackVolume(4);
    writePlaybackRate(0.1);
    expect(readPlaybackVolume()).toBe(1);
    expect(readPlaybackRate()).toBe(0.5);
  });

  it('ignores garbage stored in localStorage', () => {
    window.localStorage.setItem(PLAYBACK_VOLUME_KEY, 'loud');
    window.localStorage.setItem(PLAYBACK_RATE_KEY, 'fast');
    expect(readPlaybackVolume()).toBe(DEFAULT_PLAYBACK_VOLUME);
    expect(readPlaybackRate()).toBe(DEFAULT_PLAYBACK_RATE);
  });
});
