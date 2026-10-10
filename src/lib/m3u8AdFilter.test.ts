import { filterAdsFromM3U8 } from './m3u8AdFilter';

describe('filterAdsFromM3U8', () => {
  it('drops discontinuity markers and short ad segments', () => {
    const playlist = [
      '#EXTM3U',
      '#EXTINF:10,',
      'a.ts',
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:1.2,',
      'ad.ts',
      '#EXTINF:10,',
      'b.ts',
    ].join('\n');

    const filtered = filterAdsFromM3U8(playlist);
    expect(filtered).not.toContain('DISCONTINUITY');
    expect(filtered).not.toContain('ad.ts');
    expect(filtered).toContain('a.ts');
    expect(filtered).toContain('b.ts');
    expect(filtered).toContain('#EXTINF:10,');
  });

  it('keeps short segments when the median itself is short', () => {
    const playlist = ['#EXTINF:2,', 'a.ts', '#EXTINF:2.2,', 'b.ts'].join('\n');
    expect(filterAdsFromM3U8(playlist)).toContain('a.ts');
    expect(filterAdsFromM3U8('')).toBe('');
  });
});
