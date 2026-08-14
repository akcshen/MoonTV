'use client';

import { FavoritesProvider } from '@/components/FavoritesProvider';

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <FavoritesProvider>{children}</FavoritesProvider>;
}
