/**
 * 实验性去广告：去掉不连续标记，并丢弃相对正片明显偏短的分片。
 * 默认关闭，逻辑保持与播放页原实现一致。
 */
export function filterAdsFromM3U8(m3u8Content: string): string {
  if (!m3u8Content) return '';

  const lines = m3u8Content.split('\n');
  const durations: number[] = [];
  for (const line of lines) {
    if (line.startsWith('#EXTINF:')) {
      const duration = parseFloat(line.slice(8));
      if (!Number.isNaN(duration)) durations.push(duration);
    }
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 10;
  // 相对正常分片明显偏短的片段，更可能是插播广告
  const adDurationThreshold = Math.min(3, median * 0.35);

  const filteredLines: string[] = [];
  let skipNextUri = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 去掉不连续标记，避免广告插入点打断播放
    if (line.includes('#EXT-X-DISCONTINUITY')) {
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      const duration = parseFloat(line.slice(8));
      if (
        !Number.isNaN(duration) &&
        median >= 5 &&
        duration > 0 &&
        duration < adDurationThreshold
      ) {
        skipNextUri = true;
        continue;
      }
      filteredLines.push(line);
      continue;
    }

    // 跳过紧随被过滤 EXTINF 之后的分片 URI
    if (skipNextUri && line.trim() && !line.startsWith('#')) {
      skipNextUri = false;
      continue;
    }

    skipNextUri = false;
    filteredLines.push(line);
  }

  return filteredLines.join('\n');
}
