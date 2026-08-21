'use client';

import React, { useEffect, useRef, useState } from 'react';

import {
  SHORT_DRAMA_GENRE_ALL,
  SHORT_DRAMA_GENRES,
} from '@/lib/shortdramaGenres';

interface ShortDramaSelectorProps {
  activeGenre: string;
  onGenreChange: (genre: string) => void;
}

const options = [
  { label: '全部', value: SHORT_DRAMA_GENRE_ALL },
  ...SHORT_DRAMA_GENRES.map((genre) => ({
    label: genre.label,
    value: genre.label,
  })),
];

const ShortDramaSelector: React.FC<ShortDramaSelectorProps> = ({
  activeGenre,
  onGenreChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const activeIndex = options.findIndex(
      (option) => option.value === activeGenre
    );
    if (activeIndex < 0) return;

    const timer = setTimeout(() => {
      const button = buttonRefs.current[activeIndex];
      const container = containerRef.current;
      if (!button || !container) return;

      const buttonRect = button.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      if (buttonRect.width > 0) {
        setIndicatorStyle({
          left: buttonRect.left - containerRect.left,
          width: buttonRect.width,
        });
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [activeGenre]);

  return (
    <div className='flex flex-col sm:flex-row sm:items-center gap-2'>
      <span className='text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 min-w-[48px]'>
        题材
      </span>
      <div className='overflow-x-auto'>
        <div
          ref={containerRef}
          className='relative inline-flex bg-gray-200/60 rounded-full p-0.5 sm:p-1 dark:bg-gray-700/60 backdrop-blur-sm'
        >
          {indicatorStyle.width > 0 && (
            <div
              className='absolute top-0.5 bottom-0.5 sm:top-1 sm:bottom-1 bg-white dark:bg-gray-500 rounded-full shadow-sm transition-all duration-300 ease-out'
              style={{
                left: `${indicatorStyle.left}px`,
                width: `${indicatorStyle.width}px`,
              }}
            />
          )}

          {options.map((option, index) => {
            const isActive = activeGenre === option.value;
            return (
              <button
                key={option.value || 'all'}
                ref={(el) => {
                  buttonRefs.current[index] = el;
                }}
                onClick={() => onGenreChange(option.value)}
                className={`relative z-10 px-2 py-1 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-full transition-all duration-200 whitespace-nowrap ${
                  isActive
                    ? 'text-gray-900 dark:text-gray-100 cursor-default'
                    : 'text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 cursor-pointer'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ShortDramaSelector;
