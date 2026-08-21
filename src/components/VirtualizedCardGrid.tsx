'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useState } from 'react';

type VirtualizedCardGridProps<T> = {
  items: T[];
  columns?: number;
  estimateRowHeight?: number;
  getScrollElement?: () => HTMLElement | null;
  getItemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
};

function useResponsiveColumns(defaultColumns = 3) {
  const [columns, setColumns] = useState(defaultColumns);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w >= 1280) setColumns(6);
      else if (w >= 1024) setColumns(5);
      else if (w >= 768) setColumns(4);
      else setColumns(3);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return columns;
}

export default function VirtualizedCardGrid<T>({
  items,
  columns: columnsProp,
  estimateRowHeight = 300,
  getScrollElement,
  getItemKey,
  renderItem,
  className = '',
}: VirtualizedCardGridProps<T>) {
  const responsiveColumns = useResponsiveColumns(columnsProp ?? 3);
  const columns = columnsProp ?? responsiveColumns;

  const rows = useMemo(() => {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += columns) {
      result.push(items.slice(i, i + columns));
    }
    return result;
  }, [items, columns]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement:
      getScrollElement ??
      (() => (typeof document !== 'undefined' ? document.body : null)),
    estimateSize: () => estimateRowHeight,
    overscan: 2,
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={className}
      style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const rowItems = rows[virtualRow.index] ?? [];
        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            // 行的 transform 会创建层叠上下文，把卡片 hover 时的 z-index 困在行内，
            // 导致放大的卡片被下一行盖住；悬停时整行提级来跨行浮起
            className='px-0 sm:px-2 hover:z-10'
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              columnGap: columns >= 4 ? '2rem' : '0.5rem',
              rowGap: columns >= 4 ? '5rem' : '3.5rem',
            }}
          >
            {rowItems.map((item, colIndex) => {
              const index = virtualRow.index * columns + colIndex;
              return (
                <div key={getItemKey(item, index)} className='w-full'>
                  {renderItem(item, index)}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
