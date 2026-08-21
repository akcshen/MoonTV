'use client';

import { FavoritesProvider } from '@/components/FavoritesProvider';
import { PlayRecordsProvider } from '@/components/PlayRecordsProvider';

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <PlayRecordsProvider>
      <FavoritesProvider>{children}</FavoritesProvider>
    </PlayRecordsProvider>
  );
}
