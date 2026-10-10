/**
 * 进程内资源站健康度。连续非 JSON / 网络失败后短暂降级，
 * 避免搜索在已确认失效的源上反复等到超时。
 * 仅影响当前运行实例，不改用户配置。
 */

interface SourceHealthEntry {
  failures: number;
  demotedUntil: number;
}

const healthByKey = new Map<string, SourceHealthEntry>();

/** 连续失败达到该次数后降级。 */
export const SOURCE_FAILURES_BEFORE_DEMOTE = 2;
/** 降级窗口。窗口结束后允许再探一次。 */
export const SOURCE_DEMOTE_COOLDOWN_MS = 10 * 60 * 1000;

export function isSourceDemoted(key: string, now = Date.now()): boolean {
  const entry = healthByKey.get(key);
  if (!entry) return false;
  return entry.demotedUntil > now;
}

export function recordSourceFailure(key: string, now = Date.now()): void {
  const entry = healthByKey.get(key) ?? { failures: 0, demotedUntil: 0 };
  if (entry.demotedUntil > now) return;

  entry.failures += 1;
  if (entry.failures >= SOURCE_FAILURES_BEFORE_DEMOTE) {
    entry.demotedUntil = now + SOURCE_DEMOTE_COOLDOWN_MS;
    entry.failures = 0;
  }
  healthByKey.set(key, entry);
}

export function recordSourceSuccess(key: string): void {
  healthByKey.delete(key);
}

export function resetSourceHealth(): void {
  healthByKey.clear();
}

/** 苹果 CMS 接口应返回 JSON。HTML / 验证页 / 空正文视为无效。 */
export function parseVodJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const data = JSON.parse(trimmed) as unknown;
    if (data === null || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}
