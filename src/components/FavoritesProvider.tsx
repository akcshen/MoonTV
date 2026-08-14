'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Favorite,
  generateStorageKey,
  getAllFavorites,
  subscribeToDataUpdates,
} from '@/lib/db.client';

type FavoritesContextValue = {
  favorites: Record<string, Favorite>;
  isFavorited: (source: string, id: string) => boolean;
  ready: boolean;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<Record<string, Favorite>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAllFavorites()
      .then((data) => {
        if (!cancelled) {
          setFavorites(data);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });

    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, Favorite>) => {
        setFavorites(newFavorites);
        setReady(true);
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const isFavorited = useCallback(
    (source: string, id: string) => {
      return !!favorites[generateStorageKey(source, id)];
    },
    [favorites]
  );

  const value = useMemo(
    () => ({ favorites, isFavorited, ready }),
    [favorites, isFavorited, ready]
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavoritesContext() {
  return useContext(FavoritesContext);
}
