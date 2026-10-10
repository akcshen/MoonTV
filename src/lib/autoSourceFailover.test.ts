import { SearchResult } from '@/lib/types';

import { pickNextFailoverSource } from './autoSourceFailover';

function source(key: string, episodes = ['ep0', 'ep1']): SearchResult {
  return {
    id: key,
    title: key,
    poster: '',
    episodes,
    source: key,
    source_name: key,
    year: '2024',
  };
}

describe('pickNextFailoverSource', () => {
  const sources = [
    source('a'),
    source('b'),
    source('c'),
    source('short', ['only']),
  ];

  it('prefers the highest probed source that can resume this episode', () => {
    const next = pickNextFailoverSource({
      sources,
      currentSource: 'a',
      currentId: 'a',
      episodeIndex: 1,
      skippedKeys: new Set(),
      videoInfo: new Map([
        ['b-b', { quality: '480p', loadSpeed: '200 KB/s', pingTime: 300 }],
        ['c-c', { quality: '1080p', loadSpeed: '2 MB/s', pingTime: 40 }],
      ]),
    });
    expect(next?.source).toBe('c');
  });

  it('walks the list when nothing has been timed', () => {
    const next = pickNextFailoverSource({
      sources,
      currentSource: 'b',
      currentId: 'b',
      episodeIndex: 1,
      skippedKeys: new Set(['a-a']),
      videoInfo: new Map(),
    });
    expect(next?.source).toBe('c');
  });

  it('does not jump to a shorter source that would drop progress', () => {
    const next = pickNextFailoverSource({
      sources: [source('a'), source('short', ['only'])],
      currentSource: 'a',
      currentId: 'a',
      episodeIndex: 1,
      skippedKeys: new Set(),
      videoInfo: new Map([
        ['short-short', { quality: '4K', loadSpeed: '5 MB/s', pingTime: 20 }],
      ]),
    });
    expect(next).toBeNull();
  });
});
