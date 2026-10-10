import { SearchResult } from '@/lib/types';

import { calculateSourceScore, preferBestSource } from './sourcePreference';

function source(
  partial: Partial<SearchResult> & Pick<SearchResult, 'id' | 'source'>
): SearchResult {
  return {
    title: partial.source,
    poster: '',
    episodes: ['https://example.com/0.m3u8', 'https://example.com/1.m3u8'],
    source_name: partial.source,
    year: '2024',
    ...partial,
  };
}

describe('calculateSourceScore', () => {
  it('weights higher resolution and speed above a slower 480p source', () => {
    const fast = calculateSourceScore(
      { quality: '1080p', loadSpeed: '2 MB/s', pingTime: 80 },
      2048,
      40,
      200
    );
    const slow = calculateSourceScore(
      { quality: '480p', loadSpeed: '200 KB/s', pingTime: 180 },
      2048,
      40,
      200
    );
    expect(fast).toBeGreaterThan(slow);
  });
});

describe('preferBestSource', () => {
  it('probes at most the first six sources and keeps only successful probes', async () => {
    const sources = Array.from({ length: 7 }, (_, index) =>
      source({
        id: String(index),
        source: `s${index}`,
        source_name: `源${index}`,
        episodes: [`https://example.com/s${index}/0.m3u8`],
      })
    );
    const probed: string[] = [];
    const preferred = await preferBestSource(sources, async (url) => {
      probed.push(url);
      if (url.includes('/s0/')) throw new Error('fail');
      return { quality: '720p', loadSpeed: '1 MB/s', pingTime: 50 };
    });

    expect(probed).toHaveLength(6);
    expect(probed.some((url) => url.includes('/s6/'))).toBe(false);
    expect(preferred.best.source).toBe('s1');
    expect(preferred.videoInfo.has('s0-0')).toBe(false);
    expect(preferred.videoInfo.size).toBe(5);
  });

  it('falls back to the first source when every probe fails', async () => {
    const sources = [
      source({ id: '1', source: 'a' }),
      source({ id: '2', source: 'b' }),
    ];
    const preferred = await preferBestSource(sources, async () => {
      throw new Error('down');
    });
    expect(preferred.best.source).toBe('a');
    expect(preferred.videoInfo.size).toBe(0);
  });
});
