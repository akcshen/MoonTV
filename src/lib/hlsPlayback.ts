/**
 * HLS.js 播放策略：按设备 / 网络选择起步清晰度与缓冲，以及卡顿分级恢复。
 * 仅在浏览器端调用。
 */

export type StallRecoveryAction = 'reload' | 'recover' | 'drop-level' | 'seek';

export interface StallRecoveryState {
  timestamps: number[];
  step: number;
  lastActionAt: number;
  hintShown: boolean;
}

export interface StallRecoveryPlan {
  action: StallRecoveryAction | null;
  showHint: boolean;
}

export interface PlaybackEnvironment {
  /** 粗指针 / 窄视口 / 移动 UA，内存与解码更紧 */
  constrained: boolean;
  /** 2G/3G/省流或下行很慢 */
  weakNetwork: boolean;
  /** 弱网或小屏：保守起步，再交给 ABR 爬升 */
  conservativeStart: boolean;
}

type NetworkConnection = {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
};

const STALL_WINDOW_MS = 20000;
const STALL_HINT_COUNT = 3;
const STALL_THROTTLE_MS = 1600;
export const STALL_SEEK_SECONDS = 1.5;

const DESKTOP_BUFFER = {
  maxBufferLength: 60,
  maxMaxBufferLength: 120,
  backBufferLength: 90,
  maxBufferSize: 100 * 1000 * 1000,
};

const MOBILE_BUFFER = {
  maxBufferLength: 18,
  maxMaxBufferLength: 36,
  backBufferLength: 12,
  maxBufferSize: 24 * 1000 * 1000,
};

function readNetworkConnection(): NetworkConnection | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & {
    connection?: NetworkConnection;
    mozConnection?: NetworkConnection;
    webkitConnection?: NetworkConnection;
  };
  return nav.connection || nav.mozConnection || nav.webkitConnection || null;
}

/** 粗指针、窄视口或移动 UA，用于收紧前向缓冲。 */
export function isConstrainedPlaybackDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const smallViewport = window.matchMedia('(max-width: 768px)').matches;
    const uaMobile = /Android|iPhone|iPod|iPad|Mobile|webOS/i.test(
      navigator.userAgent
    );
    return Boolean(coarse || smallViewport || uaMobile);
  } catch {
    return false;
  }
}

export function isWeakNetwork(): boolean {
  const conn = readNetworkConnection();
  if (!conn) return false;
  if (conn.saveData) return true;
  const effectiveType = String(conn.effectiveType || '');
  if (
    effectiveType === 'slow-2g' ||
    effectiveType === '2g' ||
    effectiveType === '3g'
  ) {
    return true;
  }
  if (
    typeof conn.downlink === 'number' &&
    conn.downlink > 0 &&
    conn.downlink < 1.5
  ) {
    return true;
  }
  return false;
}

export function getPlaybackEnvironment(): PlaybackEnvironment {
  const constrained = isConstrainedPlaybackDevice();
  const weakNetwork = isWeakNetwork();
  return {
    constrained,
    weakNetwork,
    conservativeStart: constrained || weakNetwork,
  };
}

/**
 * 构造传给 hls.js 的缓冲 + ABR 起步参数。
 *
 * 现状核查（hls.js 1.6.6）：config.startLevel 默认为 undefined 时，
 * startLevel getter 返回 firstAutoLevel（用 abrEwmaDefaultEstimate=500kbps 估），
 * 不会走到 startLevel===-1 的 testBandwidth 探测。找不到合适档时还会回落到
 * 清单 firstLevel（国内源常把高码率先写）。capLevelToPlayerSize 也经常盖不住
 * 首片（元素尚未量到尺寸 / 手机 DPR 被当成高分辨率）。
 * 因此弱网/小屏显式 startLevel=-1 + testBandwidth；桌面非弱网关闭最低档探测，
 * 用 ~1.5Mbps 估计起步，避免 Wi‑Fi 先播 240p。
 */
export function getHlsPlaybackOptions(): Record<string, unknown> {
  const { constrained, conservativeStart } = getPlaybackEnvironment();
  const buffer = constrained ? MOBILE_BUFFER : DESKTOP_BUFFER;

  return {
    debug: false,
    enableWorker: true,
    lowLatencyMode: false,
    ...buffer,
    maxBufferHole: 1.5,
    nudgeMaxRetry: 5,
    startFragPrefetch: true,
    capLevelToPlayerSize: true,
    ignoreDevicePixelRatio: constrained,
    startLevel: -1,
    testBandwidth: conservativeStart,
    abrEwmaDefaultEstimate: conservativeStart ? 250000 : 1500000,
    abrBandWidthFactor: conservativeStart ? 0.8 : 0.95,
    maxStarvationDelay: conservativeStart ? 2 : 4,
  };
}

export function createStallRecoveryState(): StallRecoveryState {
  return {
    timestamps: [],
    step: 0,
    lastActionAt: 0,
    hintShown: false,
  };
}

export function resetStallRecoveryState(state: StallRecoveryState): void {
  state.timestamps = [];
  state.step = 0;
  state.lastActionAt = 0;
  state.hintShown = false;
}

/** 流畅播放一段时间后，把阶梯从「硬 seek」收回较软的步骤，但不重复弹换源提示。 */
export function relaxStallLadder(
  state: StallRecoveryState,
  now = Date.now()
): void {
  if (now - state.lastActionAt < 8000) return;
  state.step = 0;
  state.timestamps = state.timestamps.filter((t) => now - t < STALL_WINDOW_MS);
}

export function planStallRecovery(
  state: StallRecoveryState,
  now = Date.now()
): StallRecoveryPlan {
  if (now - state.lastActionAt < STALL_THROTTLE_MS) {
    return { action: null, showHint: false };
  }

  state.lastActionAt = now;
  state.timestamps.push(now);
  state.timestamps = state.timestamps.filter((t) => now - t < STALL_WINDOW_MS);

  const ladder: StallRecoveryAction[] = [
    'reload',
    'recover',
    'drop-level',
    'seek',
  ];
  const action = ladder[Math.min(state.step, ladder.length - 1)];
  state.step += 1;

  const showHint =
    !state.hintShown && state.timestamps.length >= STALL_HINT_COUNT;
  if (showHint) {
    state.hintShown = true;
  }

  return { action, showHint };
}

export type HlsLevelLike = {
  height?: number;
  width?: number;
  bitrate?: number;
  name?: string;
};

type HlsLike = {
  startLoad: (startPosition?: number) => void;
  recoverMediaError: () => void;
  currentLevel: number;
  loadLevel: number;
  nextLoadLevel: number;
  autoLevelCapping?: number;
  bandwidthEstimate?: number;
  levels?: HlsLevelLike[];
  media: HTMLMediaElement | null;
};

/** 弱网 / 卡顿条文案，与播放页快捷操作共用同一套状态。 */
export type WeakNetStatusKind = 'buffering' | 'recovering' | 'suggest-switch';

export const BUFFERING_SHOW_DELAY_MS = 1400;

export const WEAK_NET_STATUS_LABEL: Record<WeakNetStatusKind, string> = {
  buffering: '缓冲中',
  recovering: '卡顿恢复中',
  'suggest-switch': '建议换源',
};

export interface HlsPlaybackSnapshot {
  levelLabel: string | null;
  levelIndex: number;
  levelCount: number;
  canDropLevel: boolean;
  bandwidthLabel: string | null;
}

export const emptyHlsPlaybackSnapshot: HlsPlaybackSnapshot = {
  levelLabel: null,
  levelIndex: -1,
  levelCount: 0,
  canDropLevel: false,
  bandwidthLabel: null,
};

export interface WeakNetStatusInput {
  waitingSince: number | null;
  lastStallAt: number | null;
  suggestSwitch: boolean;
  now?: number;
  showDelayMs?: number;
}

export function applyStallRecoveryAction(
  hls: HlsLike,
  action: StallRecoveryAction
): void {
  switch (action) {
    case 'reload':
      hls.startLoad();
      break;
    case 'recover':
      hls.recoverMediaError();
      break;
    case 'drop-level': {
      if (!dropHlsLevelOneStep(hls)) {
        hls.startLoad();
      }
      break;
    }
    case 'seek': {
      const media = hls.media;
      if (media && !media.seeking && Number.isFinite(media.currentTime)) {
        const duration = Number.isFinite(media.duration)
          ? media.duration
          : media.currentTime + STALL_SEEK_SECONDS;
        media.currentTime = Math.min(
          duration,
          media.currentTime + STALL_SEEK_SECONDS
        );
      }
      break;
    }
    default:
      break;
  }
}

export function getAccuratePlaybackTime(
  player: {
    currentTime?: number;
    video?: HTMLVideoElement | null;
  } | null
): number {
  if (!player) return 0;
  const candidates = [player.video?.currentTime, player.currentTime];
  let best = 0;
  for (const t of candidates) {
    if (typeof t === 'number' && Number.isFinite(t) && t > best) {
      best = t;
    }
  }
  return best;
}

function resolveActiveLevelIndex(hls: HlsLike): number {
  const current = hls.currentLevel >= 0 ? hls.currentLevel : hls.loadLevel;
  return Number.isFinite(current) ? current : -1;
}

/** 与测速结果同一套清晰度标签：4K / 2K / 1080p / 720p / 480p / SD。 */
export function formatHlsLevelLabel(
  level?: HlsLevelLike | null
): string | null {
  if (!level) return null;
  const height = typeof level.height === 'number' ? level.height : 0;
  const width = typeof level.width === 'number' ? level.width : 0;
  if (height >= 2160 || width >= 3840) return '4K';
  if (height >= 1440 || width >= 2560) return '2K';
  if (height >= 1080 || width >= 1920) return '1080p';
  if (height >= 720 || width >= 1280) return '720p';
  if (height >= 480 || width >= 854) return '480p';
  if (height > 0) return `${height}p`;
  if (width > 0) return 'SD';
  const name = typeof level.name === 'string' ? level.name.trim() : '';
  if (name) return name;
  if (typeof level.bitrate === 'number' && level.bitrate > 0) {
    const kbps = Math.round(level.bitrate / 1000);
    return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)}Mbps` : `${kbps}kbps`;
  }
  return null;
}

/** hls.bandwidthEstimate 为 bit/s，展示为 KB/s 或 MB/s。 */
export function formatBandwidthLabel(bps?: number | null): string | null {
  if (typeof bps !== 'number' || !Number.isFinite(bps) || bps <= 0) {
    return null;
  }
  const bytesPerSec = bps / 8;
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  if (bytesPerSec >= 1024) {
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  }
  return `${Math.max(1, Math.round(bytesPerSec))} KB/s`;
}

export function readHlsPlaybackSnapshot(
  hls?: HlsLike | null
): HlsPlaybackSnapshot {
  if (!hls) return emptyHlsPlaybackSnapshot;
  const levels = Array.isArray(hls.levels) ? hls.levels : [];
  const index = resolveActiveLevelIndex(hls);
  const level = index >= 0 && index < levels.length ? levels[index] : null;
  const cap =
    typeof hls.autoLevelCapping === 'number' ? hls.autoLevelCapping : -1;
  const canDropLevel = levels.length > 1 && (index > 0 || cap > 0);

  return {
    levelLabel: formatHlsLevelLabel(level),
    levelIndex: index,
    levelCount: levels.length,
    canDropLevel,
    bandwidthLabel: formatBandwidthLabel(hls.bandwidthEstimate),
  };
}

/**
 * 强制降一档并封顶 ABR，避免弱网下立刻爬回高码率。
 * 已是最低档时返回 false。
 */
export function dropHlsLevelOneStep(hls: HlsLike): boolean {
  const levels = Array.isArray(hls.levels) ? hls.levels : [];
  const current = resolveActiveLevelIndex(hls);
  const cap =
    typeof hls.autoLevelCapping === 'number' ? hls.autoLevelCapping : -1;
  const baseline =
    current > 0
      ? current
      : cap > 0
      ? cap
      : current < 0 && levels.length > 1
      ? levels.length - 1
      : 0;
  if (baseline <= 0) return false;

  const next = baseline - 1;
  hls.autoLevelCapping = cap >= 0 ? Math.min(cap, next) : next;
  hls.nextLoadLevel = next;
  try {
    hls.currentLevel = next;
  } catch {
    // currentLevel 在部分状态下只读，nextLoadLevel + capping 仍会生效
  }
  return true;
}

/**
 * 决定播放器弱网条展示哪一种状态。
 * 短等待不展示（避免细小空洞闪一下）；卡顿阶梯命中后立即显示「卡顿恢复中」；
 * 多次卡顿提示与现有 hint 共用「建议换源」。
 */
export function resolveWeakNetStatus(
  input: WeakNetStatusInput
): WeakNetStatusKind | null {
  if (input.suggestSwitch) return 'suggest-switch';

  const now = input.now ?? Date.now();
  if (input.waitingSince == null) return null;

  if (input.lastStallAt != null) return 'recovering';

  const delay = input.showDelayMs ?? BUFFERING_SHOW_DELAY_MS;
  if (now - input.waitingSince >= delay) return 'buffering';
  return null;
}
