import {
  applyStallRecoveryAction,
  BUFFERING_SHOW_DELAY_MS,
  createStallRecoveryState,
  dropHlsLevelOneStep,
  formatBandwidthLabel,
  formatHlsLevelLabel,
  planStallRecovery,
  readHlsPlaybackSnapshot,
  resolveWeakNetStatus,
} from './hlsPlayback';

function mockHls(overrides: Record<string, unknown> = {}) {
  return {
    startLoad: jest.fn(),
    recoverMediaError: jest.fn(),
    currentLevel: 2,
    loadLevel: 2,
    nextLoadLevel: 2,
    autoLevelCapping: -1,
    bandwidthEstimate: 2 * 1024 * 1024 * 8,
    levels: [
      { height: 360, width: 640, bitrate: 400000 },
      { height: 480, width: 854, bitrate: 800000 },
      { height: 720, width: 1280, bitrate: 1600000 },
    ],
    media: null,
    ...overrides,
  };
}

describe('formatHlsLevelLabel', () => {
  it('maps classic resolutions', () => {
    expect(formatHlsLevelLabel({ height: 1080, width: 1920 })).toBe('1080p');
    expect(formatHlsLevelLabel({ height: 720, width: 1280 })).toBe('720p');
    expect(formatHlsLevelLabel({ height: 480, width: 854 })).toBe('480p');
    expect(formatHlsLevelLabel({ height: 2160, width: 3840 })).toBe('4K');
  });

  it('falls back to name or bitrate', () => {
    expect(formatHlsLevelLabel({ name: '高清' })).toBe('高清');
    expect(formatHlsLevelLabel({ bitrate: 1500000 })).toBe('1.5Mbps');
    expect(formatHlsLevelLabel(null)).toBeNull();
  });
});

describe('formatBandwidthLabel', () => {
  it('formats bit/s as KB/s or MB/s', () => {
    expect(formatBandwidthLabel(8 * 1024 * 1024)).toBe('1.0 MB/s');
    expect(formatBandwidthLabel(8 * 20 * 1024)).toBe('20.0 KB/s');
    expect(formatBandwidthLabel(0)).toBeNull();
    expect(formatBandwidthLabel(Number.NaN)).toBeNull();
  });
});

describe('readHlsPlaybackSnapshot / dropHlsLevelOneStep', () => {
  it('reads current level and whether a lower rung exists', () => {
    const snap = readHlsPlaybackSnapshot(mockHls());
    expect(snap.levelLabel).toBe('720p');
    expect(snap.canDropLevel).toBe(true);
    expect(snap.bandwidthLabel).toBe('2.0 MB/s');
  });

  it('drops one level and caps ABR', () => {
    const hls = mockHls();
    expect(dropHlsLevelOneStep(hls)).toBe(true);
    expect(hls.currentLevel).toBe(1);
    expect(hls.nextLoadLevel).toBe(1);
    expect(hls.autoLevelCapping).toBe(1);
    expect(readHlsPlaybackSnapshot(hls).levelLabel).toBe('480p');
  });

  it('returns false on the lowest rung', () => {
    const hls = mockHls({ currentLevel: 0, loadLevel: 0, autoLevelCapping: 0 });
    expect(dropHlsLevelOneStep(hls)).toBe(false);
    expect(readHlsPlaybackSnapshot(hls).canDropLevel).toBe(false);
  });
});

describe('resolveWeakNetStatus', () => {
  it('does not flash on a short wait', () => {
    expect(
      resolveWeakNetStatus({
        waitingSince: 1000,
        lastStallAt: null,
        suggestSwitch: false,
        now: 1000 + BUFFERING_SHOW_DELAY_MS - 1,
      })
    ).toBeNull();
  });

  it('shows buffering after the delay', () => {
    expect(
      resolveWeakNetStatus({
        waitingSince: 1000,
        lastStallAt: null,
        suggestSwitch: false,
        now: 1000 + BUFFERING_SHOW_DELAY_MS,
      })
    ).toBe('buffering');
  });

  it('shows recovering immediately after a stall action', () => {
    expect(
      resolveWeakNetStatus({
        waitingSince: 5000,
        lastStallAt: 5000,
        suggestSwitch: false,
        now: 5200,
      })
    ).toBe('recovering');
  });

  it('keeps suggest-switch as the sticky stall-ladder hint', () => {
    expect(
      resolveWeakNetStatus({
        waitingSince: null,
        lastStallAt: null,
        suggestSwitch: true,
        now: 9000,
      })
    ).toBe('suggest-switch');
  });
});

describe('stall ladder still owns recovery + hint', () => {
  it('escalates actions and only hints once after repeated stalls', () => {
    const state = createStallRecoveryState();
    const first = planStallRecovery(state, 10_000);
    const second = planStallRecovery(state, 12_000);
    const third = planStallRecovery(state, 14_000);

    expect(first).toEqual({ action: 'reload', showHint: false });
    expect(second).toEqual({ action: 'recover', showHint: false });
    expect(third).toEqual({ action: 'drop-level', showHint: true });

    const hls = mockHls();
    applyStallRecoveryAction(hls, 'drop-level');
    expect(hls.autoLevelCapping).toBe(1);
    expect(hls.nextLoadLevel).toBe(1);
  });
});
