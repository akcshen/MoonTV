import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import PageLayout from '@/components/PageLayout';

export default function SearchLoading() {
  return (
    <PageLayout activePath='/search'>
      <div className='px-4 sm:px-10 py-4 sm:py-8 overflow-visible mb-10'>
        <div className='mb-8'>
          <div className='max-w-2xl mx-auto h-12 rounded-lg bg-gray-200/80 dark:bg-gray-800 animate-pulse' />
        </div>
        <div className='max-w-[95%] mx-auto mt-12'>
          <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
            {Array.from({ length: 12 }).map((_, index) => (
              <DoubanCardSkeleton key={index} />
            ))}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
