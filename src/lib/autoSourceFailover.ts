import {
  rankProbedSources,
  SourceProbeResult,
  sourceResultKey,
} from '@/lib/sourcePreference';
import { SearchResult } from '@/lib/types';

/**
 * 两次自动换源之间的最短间隔，避免旧播放器在销毁前连续抛卡顿、把源切光。
 * 触发条件本身沿用「建议换源」：约 20 秒内连续卡顿达到提示阈值。
 */
export const AUTO_FAILOVER_COOLDOWN_MS = 8000;

export interface FailoverPickInput {
  sources: SearchResult[];
  currentSource: string;
  currentId: string;
  /** 当前集下标。只选还能播这一集的源，避免自动换源把进度打回第 1 集。 */
  episodeIndex: number;
  videoInfo: Map<string, SourceProbeResult>;
  skippedKeys: ReadonlySet<string>;
}

function hasCurrentEpisode(
  source: SearchResult,
  episodeIndex: number
): boolean {
  return (
    Array.isArray(source.episodes) && source.episodes.length > episodeIndex
  );
}

function isUsableProbe(info?: SourceProbeResult): boolean {
  if (!info || info.hasError) return false;
  if (!info.quality || info.quality === '未知' || info.quality === '错误') {
    return false;
  }
  return true;
}

/**
 * 选择自动换源目标：
 * 1. 跳过当前源、本集已经失败过的源，以及集数不够、无法续播的源；
 * 2. 有成功测速结果时，按与进页优选相同的评分取最高；
 * 3. 否则按列表顺序取当前源之后的下一个（到末尾再从头）。
 */
export function pickNextFailoverSource(
  input: FailoverPickInput
): SearchResult | null {
  const currentKey = sourceResultKey(input.currentSource, input.currentId);
  const eligible = input.sources.filter((source) => {
    const key = sourceResultKey(source.source, source.id);
    if (key === currentKey || input.skippedKeys.has(key)) return false;
    return hasCurrentEpisode(source, input.episodeIndex);
  });
  if (eligible.length === 0) return null;

  const probed = eligible.flatMap((source) => {
    const info = input.videoInfo.get(sourceResultKey(source.source, source.id));
    if (!isUsableProbe(info) || !info) return [];
    return [{ source, testResult: info }];
  });

  if (probed.length > 0) {
    return rankProbedSources(probed)[0]?.source ?? null;
  }

  const index = input.sources.findIndex(
    (source) => sourceResultKey(source.source, source.id) === currentKey
  );
  const start = index >= 0 ? index + 1 : 0;
  const rotated = [
    ...input.sources.slice(start),
    ...input.sources.slice(0, Math.max(start, 0)),
  ];
  const eligibleKeys = new Set(
    eligible.map((source) => sourceResultKey(source.source, source.id))
  );
  return (
    rotated.find((source) =>
      eligibleKeys.has(sourceResultKey(source.source, source.id))
    ) ?? null
  );
}
