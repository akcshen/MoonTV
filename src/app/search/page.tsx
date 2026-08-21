/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any */
'use client';

import { ChevronUp, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import {
  addSearchHistory,
  clearSearchHistory,
  deleteSearchHistory,
  getSearchHistory,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import {
  AggregatedSearchEntry,
  DEFAULT_SEARCH_CONCURRENCY,
  filterYellowResults,
  mergeSortedSearchResults,
  SearchResultsAggregator,
  searchSourcesProgressive,
} from '@/lib/progressiveSearch';
import { SearchResult } from '@/lib/types';
import { getEpisodeCount } from '@/lib/utils';

import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';
import VirtualizedCardGrid from '@/components/VirtualizedCardGrid';

function SearchPageClient() {
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchingMore, setIsSearchingMore] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [aggregatedResults, setAggregatedResults] = useState<
    AggregatedSearchEntry[]
  >([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<SearchResult[]>([]);
  const aggregatorRef = useRef(new SearchResultsAggregator());

  const getDefaultAggregate = () => {
    if (typeof window !== 'undefined') {
      const userSetting = localStorage.getItem('defaultAggregateSearch');
      if (userSetting !== null) {
        return JSON.parse(userSetting);
      }
    }
    return true;
  };

  const [viewMode, setViewMode] = useState<'agg' | 'all'>(() => {
    return getDefaultAggregate() ? 'agg' : 'all';
  });

  useEffect(() => {
    !searchParams.get('q') && document.getElementById('searchInput')?.focus();

    getSearchHistory().then(setSearchHistory);

    const unsubscribe = subscribeToDataUpdates(
      'searchHistoryUpdated',
      (newHistory: string[]) => {
        setSearchHistory(newHistory);
      }
    );

    const handleScroll = () => {
      setShowBackToTop((document.body.scrollTop || 0) > 300);
    };

    document.body.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      unsubscribe();
      document.body.removeEventListener('scroll', handleScroll);
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const query = searchParams.get('q');
    if (query) {
      setSearchQuery(query);
      setIsLoading(true);
      setShowResults(true);
      fetchSearchResults(query);
      addSearchHistory(query);
    } else {
      setShowResults(false);
      setIsLoading(false);
      setIsSearchingMore(false);
      setSearchResults([]);
      setAggregatedResults([]);
      resultsRef.current = [];
      aggregatorRef.current.reset('');
    }
  }, [searchParams]);

  const fetchSearchResults = async (query: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const trimmed = query.trim();

    try {
      setIsLoading(true);
      setIsSearchingMore(false);
      setSearchResults([]);
      setAggregatedResults([]);
      resultsRef.current = [];
      aggregatorRef.current.reset(trimmed);

      let firstPaint = false;

      await searchSourcesProgressive({
        query: trimmed,
        lite: true,
        signal: controller.signal,
        concurrency: DEFAULT_SEARCH_CONCURRENCY,
        filter: filterYellowResults,
        onBatch: (_merged, delta) => {
          if (!delta.length || controller.signal.aborted) return;

          resultsRef.current = mergeSortedSearchResults(
            resultsRef.current,
            delta,
            trimmed
          );
          setSearchResults(resultsRef.current);
          setAggregatedResults(aggregatorRef.current.addBatch(delta));

          if (!firstPaint) {
            firstPaint = true;
            setIsLoading(false);
            setIsSearchingMore(true);
          }
        },
      });
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      setSearchResults([]);
      setAggregatedResults([]);
      resultsRef.current = [];
      aggregatorRef.current.reset(trimmed);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
        setIsSearchingMore(false);
      }
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim().replace(/\s+/g, ' ');
    if (!trimmed) return;

    setSearchQuery(trimmed);
    setIsLoading(true);
    setShowResults(true);

    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const scrollToTop = () => {
    try {
      document.body.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch {
      document.body.scrollTop = 0;
    }
  };

  const showInitialSkeleton = isLoading && searchResults.length === 0;

  return (
    <PageLayout activePath='/search'>
      <div className='px-4 sm:px-10 py-4 sm:py-8 overflow-visible mb-10'>
        <div className='mb-8'>
          <form onSubmit={handleSearch} className='max-w-2xl mx-auto'>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500' />
              <input
                id='searchInput'
                type='text'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='搜索电影、电视剧...'
                className='w-full h-12 rounded-lg bg-gray-50/80 py-3 pl-10 pr-4 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:bg-white border border-gray-200/50 shadow-sm dark:bg-gray-800 dark:text-gray-300 dark:placeholder-gray-500 dark:focus:bg-gray-700 dark:border-gray-700'
              />
            </div>
          </form>
        </div>

        <div className='max-w-[95%] mx-auto mt-12 overflow-visible'>
          {showInitialSkeleton ? (
            <section className='mb-12'>
              <div className='mb-8 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                  搜索中...
                </h2>
              </div>
              <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
                {Array.from({ length: 12 }).map((_, index) => (
                  <DoubanCardSkeleton key={index} />
                ))}
              </div>
            </section>
          ) : showResults ? (
            <section className='mb-12'>
              <div className='mb-8 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                  搜索结果
                  {isSearchingMore && (
                    <span className='ml-2 text-sm font-normal text-gray-500 dark:text-gray-400'>
                      继续搜索中...
                    </span>
                  )}
                </h2>
                <label className='flex items-center gap-2 cursor-pointer select-none'>
                  <span className='text-sm text-gray-700 dark:text-gray-300'>
                    聚合
                  </span>
                  <div className='relative'>
                    <input
                      type='checkbox'
                      className='sr-only peer'
                      checked={viewMode === 'agg'}
                      onChange={() =>
                        setViewMode(viewMode === 'agg' ? 'all' : 'agg')
                      }
                    />
                    <div className='w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                    <div className='absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4'></div>
                  </div>
                </label>
              </div>
              {viewMode === 'agg' ? (
                <VirtualizedCardGrid
                  key='search-results-agg'
                  items={aggregatedResults}
                  getItemKey={([mapKey]) => `agg-${mapKey}`}
                  renderItem={([, group]) => (
                    <VideoCard
                      from='search'
                      items={group}
                      query={
                        searchQuery.trim() !== group[0].title
                          ? searchQuery.trim()
                          : ''
                      }
                    />
                  )}
                />
              ) : (
                <VirtualizedCardGrid
                  key='search-results-all'
                  items={searchResults}
                  getItemKey={(item) => `all-${item.source}-${item.id}`}
                  renderItem={(item) => {
                    const episodeCount = getEpisodeCount(item);
                    return (
                      <VideoCard
                        id={item.id}
                        title={item.title + ' ' + item.type_name}
                        poster={item.poster}
                        episodes={episodeCount}
                        source={item.source}
                        source_name={item.source_name}
                        douban_id={item.douban_id?.toString()}
                        query={
                          searchQuery.trim() !== item.title
                            ? searchQuery.trim()
                            : ''
                        }
                        year={item.year}
                        from='search'
                        type={episodeCount > 1 ? 'tv' : 'movie'}
                      />
                    );
                  }}
                />
              )}
              {searchResults.length === 0 && !isSearchingMore && (
                <div className='col-span-full text-center text-gray-500 py-8 dark:text-gray-400'>
                  未找到相关结果
                </div>
              )}
            </section>
          ) : searchHistory.length > 0 ? (
            <section className='mb-12'>
              <h2 className='mb-4 text-xl font-bold text-gray-800 text-left dark:text-gray-200'>
                搜索历史
                {searchHistory.length > 0 && (
                  <button
                    onClick={() => {
                      clearSearchHistory();
                    }}
                    className='ml-3 text-sm text-gray-500 hover:text-red-500 transition-colors dark:text-gray-400 dark:hover:text-red-500'
                  >
                    清空
                  </button>
                )}
              </h2>
              <div className='flex flex-wrap gap-2'>
                {searchHistory.map((item) => (
                  <div key={item} className='relative group'>
                    <button
                      onClick={() => {
                        setSearchQuery(item);
                        router.push(
                          `/search?q=${encodeURIComponent(item.trim())}`
                        );
                      }}
                      className='px-4 py-2 bg-gray-500/10 hover:bg-gray-300 rounded-full text-sm text-gray-700 transition-colors duration-200 dark:bg-gray-700/50 dark:hover:bg-gray-600 dark:text-gray-300'
                    >
                      {item}
                    </button>
                    <button
                      aria-label='删除搜索历史'
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        deleteSearchHistory(item);
                      }}
                      className='absolute -top-1 -right-1 w-4 h-4 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 bg-gray-400 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] transition-colors'
                    >
                      <X className='w-3 h-3' />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <button
        onClick={scrollToTop}
        className={`fixed bottom-20 md:bottom-6 right-6 z-[500] w-12 h-12 bg-green-500/90 hover:bg-green-500 text-white rounded-full shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out flex items-center justify-center group ${
          showBackToTop
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
        aria-label='返回顶部'
      >
        <ChevronUp className='w-6 h-6 transition-transform group-hover:scale-110' />
      </button>
    </PageLayout>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageClient />
    </Suspense>
  );
}
