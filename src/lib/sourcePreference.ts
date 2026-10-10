/* eslint-disable no-console */

import { SearchResult } from '@/lib/types';

export interface SourceProbeResult {
  quality: string;
  loadSpeed: string;
  pingTime: number;
  hasError?: boolean;
}

export interface ProbedSource<T = SearchResult> {
  source: T;
  testResult: SourceProbeResult;
}

export function sourceResultKey(source: string, id: string): string {
  return `${source}-${id}`;
}

/** 把测速文案折成 KB/s。无法解析时返回 null。 */
export function parseLoadSpeedKBps(speedStr: string): number | null {
  if (speedStr === '未知' || speedStr === '测量中...') return null;
  const match = speedStr.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  return match[2] === 'MB/s' ? value * 1024 : value;
}

/**
 * 播放源综合评分：分辨率 40% + 下载速度 40% + 延迟 20%。
 * 速度、延迟按本次候选里的区间线性映射。
 */
export function calculateSourceScore(
  testResult: SourceProbeResult,
  maxSpeed: number,
  minPing: number,
  maxPing: number
): number {
  let score = 0;

  const qualityScore = (() => {
    switch (testResult.quality) {
      case '4K':
        return 100;
      case '2K':
        return 85;
      case '1080p':
        return 75;
      case '720p':
        return 60;
      case '480p':
        return 40;
      case 'SD':
        return 20;
      default:
        return 0;
    }
  })();
  score += qualityScore * 0.4;

  const speedScore = (() => {
    const speedKBps = parseLoadSpeedKBps(testResult.loadSpeed);
    if (speedKBps == null) return 30;
    if (maxSpeed <= 0) return 30;
    const speedRatio = speedKBps / maxSpeed;
    return Math.min(100, Math.max(0, speedRatio * 100));
  })();
  score += speedScore * 0.4;

  const pingScore = (() => {
    const ping = testResult.pingTime;
    if (ping <= 0) return 0;
    if (maxPing === minPing) return 100;
    const pingRatio = (maxPing - ping) / (maxPing - minPing);
    return Math.min(100, Math.max(0, pingRatio * 100));
  })();
  score += pingScore * 0.2;

  return Math.round(score * 100) / 100;
}

export function rankProbedSources<T>(
  results: Array<ProbedSource<T>>
): Array<ProbedSource<T> & { score: number }> {
  const validSpeeds = results
    .map((result) => parseLoadSpeedKBps(result.testResult.loadSpeed))
    .filter((speed): speed is number => speed != null && speed > 0);
  const maxSpeed = validSpeeds.length > 0 ? Math.max(...validSpeeds) : 1024;

  const validPings = results
    .map((result) => result.testResult.pingTime)
    .filter((ping) => ping > 0);
  const minPing = validPings.length > 0 ? Math.min(...validPings) : 50;
  const maxPing = validPings.length > 0 ? Math.max(...validPings) : 1000;

  return results
    .map((result) => ({
      ...result,
      score: calculateSourceScore(
        result.testResult,
        maxSpeed,
        minPing,
        maxPing
      ),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * 限制测速数量与并发，选出评分最高的播放源。
 * 只把成功的测速放进 videoInfo，失败项留给选集面板按需再测。
 */
export async function preferBestSource(
  sources: SearchResult[],
  probe: (url: string) => Promise<SourceProbeResult>
): Promise<{
  best: SearchResult;
  videoInfo: Map<string, SourceProbeResult>;
}> {
  const videoInfo = new Map<string, SourceProbeResult>();
  if (sources.length === 0) {
    throw new Error('没有可优选的播放源');
  }
  if (sources.length === 1) {
    return { best: sources[0], videoInfo };
  }

  const candidates = sources.slice(0, 6);
  const batchSize = Math.min(3, candidates.length);
  const allResults: Array<ProbedSource | null> = [];

  for (let start = 0; start < candidates.length; start += batchSize) {
    const batchSources = candidates.slice(start, start + batchSize);
    const batchResults = await Promise.all(
      batchSources.map(async (source) => {
        try {
          if (!source.episodes || source.episodes.length === 0) {
            console.warn(`播放源 ${source.source_name} 没有可用的播放地址`);
            return null;
          }
          const episodeUrl =
            source.episodes.length > 1
              ? source.episodes[1]
              : source.episodes[0];
          const testResult = await probe(episodeUrl);
          return { source, testResult };
        } catch {
          return null;
        }
      })
    );
    allResults.push(...batchResults);
  }

  allResults.forEach((result) => {
    if (!result) return;
    videoInfo.set(
      sourceResultKey(result.source.source, result.source.id),
      result.testResult
    );
  });

  const successfulResults = allResults.filter(Boolean) as ProbedSource[];
  if (successfulResults.length === 0) {
    console.warn('所有播放源测速都失败，使用第一个播放源');
    return { best: sources[0], videoInfo };
  }

  const resultsWithScore = rankProbedSources(successfulResults);
  console.log('播放源评分排序结果:');
  resultsWithScore.forEach((result, index) => {
    console.log(
      `${index + 1}. ${
        result.source.source_name
      } - 评分: ${result.score.toFixed(2)} (${result.testResult.quality}, ${
        result.testResult.loadSpeed
      }, ${result.testResult.pingTime}ms)`
    );
  });

  return { best: resultsWithScore[0].source, videoInfo };
}
