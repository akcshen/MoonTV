/** 播放相关的本地开关。自动换源默认关闭。 */

export const ENABLE_OPTIMIZATION_KEY = 'enableOptimization';
export const ENABLE_BLOCK_AD_KEY = 'enable_blockad';
export const AUTO_SOURCE_FAILOVER_KEY = 'enableAutoSourceFailover';
export const AUTO_SOURCE_FAILOVER_EVENT = 'moontv-auto-failover';

function readJsonBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const saved = window.localStorage.getItem(key);
  if (saved === null) return fallback;
  try {
    return Boolean(JSON.parse(saved));
  } catch {
    return fallback;
  }
}

/** 播放源优选 / 测速。缺省为开，与原播放页一致。 */
export function readOptimizationEnabled(): boolean {
  return readJsonBoolean(ENABLE_OPTIMIZATION_KEY, true);
}

/** 实验性去广告。缺省为关。存储值是 'true' / 'false' 字符串。 */
export function readBlockAdEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const saved = window.localStorage.getItem(ENABLE_BLOCK_AD_KEY);
  if (saved === null) return false;
  return saved === 'true';
}

/** 卡顿达到「建议换源」后自动切到下一个源。缺省为关。 */
export function readAutoSourceFailoverEnabled(): boolean {
  return readJsonBoolean(AUTO_SOURCE_FAILOVER_KEY, false);
}

export function writeAutoSourceFailoverEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    AUTO_SOURCE_FAILOVER_KEY,
    JSON.stringify(enabled)
  );
  window.dispatchEvent(
    new CustomEvent(AUTO_SOURCE_FAILOVER_EVENT, { detail: enabled })
  );
}
