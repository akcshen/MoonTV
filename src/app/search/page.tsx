/* eslint-disable react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any */
'use client';

import { ChevronUp, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';

import {
  addSearchHistory,
  clearSearchHistory,
  deleteSearchHistory,
  getSearchHistory,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { SearchResult } from '@/lib/types';
import { getEpisodeCount } from '@/lib/utils';
import { yellowWords } from '@/lib/yellow';

import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

type ApiSiteBrief = { key: string; name: string };

const SEARCH_CONCURRENCY = 4;

function sortSearchResults(
  results: SearchResult[],
  query: string
): SearchResult[] {
  const q = query.trim();
  return [...results].sort((a, b) => {
    const aExactMatch = a.title === q;
    const bExactMatch = b.title === q;

    if (aExactMatch && !bExactMatch) return -1;
    if (!aExactMatch && bExactMatch) return 1;

    if (a.year === b.year) {
      return a.title.localeCompare(b.title);
    }
    if (a.year === 'unknown' && b.year === 'unknown') {
      return 0;
    }
    if (a.year === 'unknown') return 1;
    if (b.year === 'unknown') return -1;
    return parseInt(a.year) > parseInt(b.year) ? -1 : 1;
  });
}

function filterYellow(results: SearchResult[]): SearchResult[] {
  if (
    typeof window !== 'undefined' &&
    (window as any).RUNTIME_CONFIG?.DISABLE_YELLOW_FILTER
  ) {
    return results;
  }
  return results.filter((result) => {
    const typeName = result.type_name || '';
    return !yellowWords.some((word: string) => typeName.includes(word));
  });
}

function SearchPageClient() {
  // 搜索历史
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  // 返回顶部按钮显示状态
  const [showBackToTop, setShowBackToTop] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchingMore, setIsSearchingMore] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<SearchResult[]>([]);

  // 获取默认聚合设置：只读取用户本地设置，默认为 true
  const getDefaultAggregate = () => {
    if (typeof window !== 'undefined') {
      const userSetting = localStorage.getItem('defaultAggregateSearch');
      if (userSetting !== null) {
        return JSON.parse(userSetting);
      }
    }
    return true; // 默认启用聚合
  };

  const [viewMode, setViewMode] = useState<'agg' | 'all'>(() => {
    return getDefaultAggregate() ? 'agg' : 'all';
  });

  // 聚合后的结果（按标题和年份分组）
  const aggregatedResults = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    searchResults.forEach((item) => {
      const episodeCount = getEpisodeCount(item);
      // 使用 title + year + type 作为键，year 必然存在，但依然兜底 'unknown'
      const key = `${item.title.replaceAll(' ', '')}-${
        item.year || 'unknown'
      }-${episodeCount === 1 ? 'movie' : 'tv'}`;
      const arr = map.get(key) || [];
      arr.push(item);
      map.set(key, arr);
    });
    return Array.from(map.entries()).sort((a, b) => {
      // 优先排序：标题与搜索词完全一致的排在前面
      const aExactMatch = a[1][0].title
        .replaceAll(' ', '')
        .includes(searchQuery.trim().replaceAll(' ', ''));
      const bExactMatch = b[1][0].title
        .replaceAll(' ', '')
        .includes(searchQuery.trim().replaceAll(' ', ''));

      if (aExactMatch && !bExactMatch) return -1;
      if (!aExactMatch && bExactMatch) return 1;

      // 年份排序
      if (a[1][0].year === b[1][0].year) {
        return a[0].localeCompare(b[0]);
      } else {
        // 处理 unknown 的情况
        const aYear = a[1][0].year;
        const bYear = b[1][0].year;

        if (aYear === 'unknown' && bYear === 'unknown') {
          return 0;
        } else if (aYear === 'unknown') {
          return 1; // a 排在后面
        } else if (bYear === 'unknown') {
          return -1; // b 排在后面
        } else {
          // 都是数字年份，按数字大小排序（大的在前面）
          return aYear > bYear ? -1 : 1;
        }
      }
    });
  }, [searchResults, searchQuery]);

  useEffect(() => {
    // 无搜索参数时聚焦搜索框
    !searchParams.get('q') && document.getElementById('searchInput')?.focus();

    // 初始加载搜索历史
    getSearchHistory().then(setSearchHistory);

    // 监听搜索历史更新事件
    const unsubscribe = subscribeToDataUpdates(
      'searchHistoryUpdated',
      (newHistory: string[]) => {
        setSearchHistory(newHistory);
      }
    );

    // 获取滚动位置的函数 - 专门针对 body 滚动
    const getScrollTop = () => {
      return document.body.scrollTop || 0;
    };

    // 监听 body 元素的滚动事件（避免 rAF 常驻循环耗电）
    const handleScroll = () => {
      const scrollTop = getScrollTop();
      setShowBackToTop(scrollTop > 300);
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
    // 当搜索参数变化时更新搜索状态（唯一请求入口，避免与提交时双发）
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
      resultsRef.current = [];
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
      resultsRef.current = [];

      // 先拉可用源，再按源并发搜索：快源先出结果
      const resourcesRes = await fetch('/api/search/resources', {
        signal: controller.signal,
      });
      if (!resourcesRes.ok) {
        throw new Error('获取搜索源失败');
      }
      const resources = (await resourcesRes.json()) as ApiSiteBrief[];
      if (!Array.isArray(resources) || resources.length === 0) {
        setSearchResults([]);
        return;
      }

      if (controller.signal.aborted) return;

      let pendingIndex = 0;
      let completed = 0;
      let firstPaint = false;

      const mergeBatch = (batch: SearchResult[]) => {
        if (!batch.length || controller.signal.aborted) return;
        const merged = sortSearchResults(
          [...resultsRef.current, ...batch],
          trimmed
        );
        resultsRef.current = merged;
        setSearchResults(merged);
        if (!firstPaint) {
          firstPaint = true;
          setIsLoading(false);
          setIsSearchingMore(true);
        }
      };

      const searchOne = async (site: ApiSiteBrief) => {
        try {
          const response = await fetch(
            `/api/search?q=${encodeURIComponent(
              trimmed
            )}&lite=1&source=${encodeURIComponent(site.key)}`,
            { signal: controller.signal }
          );
          if (!response.ok) return;
          const data = await response.json();
          mergeBatch(filterYellow(data.results || []));
        } catch (error) {
          if ((error as Error)?.name === 'AbortError') throw error;
          // 单源失败不影响整体
        } finally {
          completed += 1;
          if (completed >= resources.length && !controller.signal.aborted) {
            setIsSearchingMore(false);
          }
        }
      };

      const worker = async () => {
        while (!controller.signal.aborted) {
          const index = pendingIndex++;
          if (index >= resources.length) return;
          await searchOne(resources[index]);
        }
      };

      const pool = Math.min(SEARCH_CONCURRENCY, resources.length);
      await Promise.all(Array.from({ length: pool }, () => worker()));
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      setSearchResults([]);
      resultsRef.current = [];
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

    // 回显搜索框；请求仅由 searchParams effect 触发
    setSearchQuery(trimmed);
    setIsLoading(true);
    setShowResults(true);

    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  // 返回顶部功能
  const scrollToTop = () => {
    try {
      // 根据调试结果，真正的滚动容器是 document.body
      document.body.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch {
      // 如果平滑滚动完全失败，使用立即滚动
      document.body.scrollTop = 0;
    }
  };

  const showInitialSkeleton = isLoading && searchResults.length === 0;

  return (
    <PageLayout activePath='/search'>
      <div className='px-4 sm:px-10 py-4 sm:py-8 overflow-visible mb-10'>
        {/* 搜索框 */}
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

        {/* 搜索结果或搜索历史 */}
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
              {/* 标题 + 聚合开关 */}
              <div className='mb-8 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                  搜索结果
                  {isSearchingMore && (
                    <span className='ml-2 text-sm font-normal text-gray-500 dark:text-gray-400'>
                      继续搜索中...
                    </span>
                  )}
                </h2>
                {/* 聚合开关 */}
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
              <div
                key={`search-results-${viewMode}`}
                className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'
              >
                {viewMode === 'agg'
                  ? aggregatedResults.map(([mapKey, group]) => {
                      return (
                        <div key={`agg-${mapKey}`} className='w-full'>
                          <VideoCard
                            from='search'
                            items={group}
                            query={
                              searchQuery.trim() !== group[0].title
                                ? searchQuery.trim()
                                : ''
                            }
                          />
                        </div>
                      );
                    })
                  : searchResults.map((item) => {
                      const episodeCount = getEpisodeCount(item);
                      return (
                        <div
                          key={`all-${item.source}-${item.id}`}
                          className='w-full'
                        >
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
                        </div>
                      );
                    })}
                {searchResults.length === 0 && !isSearchingMore && (
                  <div className='col-span-full text-center text-gray-500 py-8 dark:text-gray-400'>
                    未找到相关结果
                  </div>
                )}
              </div>
            </section>
          ) : searchHistory.length > 0 ? (
            // 搜索历史
            <section className='mb-12'>
              <h2 className='mb-4 text-xl font-bold text-gray-800 text-left dark:text-gray-200'>
                搜索历史
                {searchHistory.length > 0 && (
                  <button
                    onClick={() => {
                      clearSearchHistory(); // 事件监听会自动更新界面
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
                    {/* 删除按钮：触摸设备始终可见 */}
                    <button
                      aria-label='删除搜索历史'
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        deleteSearchHistory(item); // 事件监听会自动更新界面
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

      {/* 返回顶部悬浮按钮 */}
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
