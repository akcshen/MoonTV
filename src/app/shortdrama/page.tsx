'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { ShortDramaItem } from '@/lib/shortdrama';
import { fetchShortDramaPage } from '@/lib/shortdrama.client';
import { SHORT_DRAMA_GENRE_ALL } from '@/lib/shortdramaGenres';

import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import PageLayout from '@/components/PageLayout';
import ShortDramaSelector from '@/components/ShortDramaSelector';
import VideoCard from '@/components/VideoCard';
import VirtualizedCardGrid from '@/components/VirtualizedCardGrid';

const SKELETON_COUNT = 24;

function ShortDramaPageClient() {
  const [items, setItems] = useState<ShortDramaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [genre, setGenre] = useState(SHORT_DRAMA_GENRE_ALL);

  const loadingRef = useRef<HTMLDivElement | null>(null);
  const seenKeysRef = useRef<Set<string>>(new Set());

  const appendItems = useCallback((incoming: ShortDramaItem[]) => {
    setItems((prev) => {
      const next = [...prev];
      incoming.forEach((item) => {
        const key = `${item.source}-${item.id}`;
        if (seenKeysRef.current.has(key)) return;
        seenKeysRef.current.add(key);
        next.push(item);
      });
      return next;
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const isFirstPage = page === 1;

    if (isFirstPage) {
      setLoading(true);
      seenKeysRef.current = new Set();
    } else {
      setIsLoadingMore(true);
    }

    fetchShortDramaPage({ page, genre, signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (isFirstPage) {
          seenKeysRef.current = new Set();
          setItems([]);
        }
        appendItems(data.results);
        setHasMore(data.hasMore && data.results.length > 0);
        setError(null);
      })
      .catch((err) => {
        if ((err as Error)?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : '获取短剧失败');
        setHasMore(false);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
        setIsLoadingMore(false);
      });

    return () => controller.abort();
  }, [page, genre, appendItems]);

  const handleGenreChange = useCallback(
    (next: string) => {
      if (next === genre) return;
      setGenre(next);
      setLoading(true);
      setHasMore(true);
      // 切题材要回到第一页；page 已是 1 时 effect 不会重跑，需手动清空
      setPage((prev) => {
        if (prev === 1) {
          seenKeysRef.current = new Set();
          setItems([]);
        }
        return 1;
      });
    },
    [genre]
  );

  useEffect(() => {
    if (!hasMore || isLoadingMore || loading) return;
    const target = loadingRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setPage((prev) => prev + 1);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(target);

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loading]);

  return (
    <PageLayout activePath='/shortdrama'>
      <div className='px-4 sm:px-10 py-4 sm:py-8 overflow-visible'>
        <div className='mb-6 sm:mb-8 space-y-4 sm:space-y-6'>
          <div>
            <h1 className='text-2xl sm:text-3xl font-bold text-gray-800 mb-1 sm:mb-2 dark:text-gray-200'>
              短剧
            </h1>
            <p className='text-sm sm:text-base text-gray-600 dark:text-gray-400'>
              聚合各资源站的短剧更新，点击即可直接播放
            </p>
          </div>

          <div className='bg-white/60 dark:bg-gray-800/40 rounded-2xl p-4 sm:p-6 border border-gray-200/30 dark:border-gray-700/30 backdrop-blur-sm'>
            <ShortDramaSelector
              activeGenre={genre}
              onGenreChange={handleGenreChange}
            />
          </div>
        </div>

        <div className='max-w-[95%] mx-auto mt-8 overflow-visible'>
          {loading ? (
            <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-12 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-8 sm:gap-y-20'>
              {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                <DoubanCardSkeleton key={index} />
              ))}
            </div>
          ) : (
            <VirtualizedCardGrid
              items={items}
              estimateRowHeight={320}
              getItemKey={(item, index) => `${item.source}-${item.id}-${index}`}
              renderItem={(item) => (
                <VideoCard
                  from='search'
                  id={item.id}
                  source={item.source}
                  source_name={item.source_name}
                  title={item.title}
                  poster={item.poster}
                  episodes={item.episode_count}
                  year={item.year}
                  type='tv'
                />
              )}
            />
          )}

          {hasMore && !loading && (
            <div ref={loadingRef} className='flex justify-center mt-12 py-8'>
              {isLoadingMore && (
                <div className='flex items-center gap-2'>
                  <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-green-500'></div>
                  <span className='text-gray-600'>加载中...</span>
                </div>
              )}
            </div>
          )}

          {!hasMore && items.length > 0 && (
            <div className='text-center text-gray-500 py-8'>已加载全部内容</div>
          )}

          {!loading && items.length === 0 && (
            <div className='text-center text-gray-500 py-8'>
              {error || '暂无短剧内容，请检查资源站配置'}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

export default function ShortDramaPage() {
  return (
    <Suspense>
      <ShortDramaPageClient />
    </Suspense>
  );
}
