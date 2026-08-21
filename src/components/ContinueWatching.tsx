'use client';

import { useMemo } from 'react';

import type { PlayRecord } from '@/lib/db.client';
import { clearAllPlayRecords } from '@/lib/db.client';

import { usePlayRecordsContext } from '@/components/PlayRecordsProvider';
import ScrollableRow from '@/components/ScrollableRow';
import VideoCard from '@/components/VideoCard';

const CONTINUE_WATCHING_LIMIT = 16;

interface ContinueWatchingProps {
  className?: string;
}

function getProgress(record: PlayRecord) {
  if (record.total_time === 0) return 0;
  return (record.play_time / record.total_time) * 100;
}

function parseKey(key: string) {
  const [source, id] = key.split('+');
  return { source, id };
}

export default function ContinueWatching({ className }: ContinueWatchingProps) {
  const playRecordsCtx = usePlayRecordsContext();
  const loading = !playRecordsCtx?.ready;
  const allPlayRecords = playRecordsCtx?.playRecords;

  const recentPlayRecords = useMemo(() => {
    if (!allPlayRecords) return [];
    return Object.entries(allPlayRecords)
      .map(([key, record]) => ({ ...record, key }))
      .sort((a, b) => b.save_time - a.save_time)
      .slice(0, CONTINUE_WATCHING_LIMIT);
  }, [allPlayRecords]);

  if (!loading && recentPlayRecords.length === 0) {
    return null;
  }

  return (
    <section className={`mb-8 ${className || ''}`}>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
          继续观看
        </h2>
        {!loading && recentPlayRecords.length > 0 && (
          <button
            className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            onClick={() => clearAllPlayRecords()}
          >
            清空
          </button>
        )}
      </div>
      <ScrollableRow>
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
              >
                <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                  <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                </div>
                <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                <div className='mt-1 h-3 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
              </div>
            ))
          : recentPlayRecords.map((record) => {
              const { source, id } = parseKey(record.key);
              return (
                <div
                  key={record.key}
                  className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                >
                  <VideoCard
                    id={id}
                    title={record.title}
                    poster={record.cover}
                    year={record.year}
                    source={source}
                    source_name={record.source_name}
                    progress={getProgress(record)}
                    episodes={record.total_episodes}
                    currentEpisode={record.index}
                    query={record.search_title}
                    from='playrecord'
                    type={record.total_episodes > 1 ? 'tv' : ''}
                  />
                </div>
              );
            })}
      </ScrollableRow>
    </section>
  );
}
