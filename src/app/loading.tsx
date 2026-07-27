import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import PageLayout from '@/components/PageLayout';

export default function HomeLoading() {
  return (
    <PageLayout>
      <div className='px-2 sm:px-10 py-4 sm:py-8 overflow-visible'>
        <div className='mb-8'>
          <div className='h-8 w-40 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-4' />
          <div className='flex gap-4 overflow-hidden'>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className='w-36 flex-shrink-0'>
                <DoubanCardSkeleton />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
