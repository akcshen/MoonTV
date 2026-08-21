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
  getAllPlayRecords,
  PlayRecord,
  subscribeToDataUpdates,
} from '@/lib/db.client';

type PlayRecordsContextValue = {
  playRecords: Record<string, PlayRecord>;
  getPlayRecord: (source: string, id: string) => PlayRecord | undefined;
  ready: boolean;
};

const PlayRecordsContext = createContext<PlayRecordsContextValue | null>(null);

export function PlayRecordsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [playRecords, setPlayRecords] = useState<Record<string, PlayRecord>>(
    {}
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAllPlayRecords()
      .then((data) => {
        if (!cancelled) {
          setPlayRecords(data);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });

    const unsubscribe = subscribeToDataUpdates(
      'playRecordsUpdated',
      (newRecords: Record<string, PlayRecord>) => {
        setPlayRecords(newRecords);
        setReady(true);
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const getPlayRecord = useCallback(
    (source: string, id: string) => {
      return playRecords[`${source}+${id}`];
    },
    [playRecords]
  );

  const value = useMemo(
    () => ({ playRecords, getPlayRecord, ready }),
    [playRecords, getPlayRecord, ready]
  );

  return (
    <PlayRecordsContext.Provider value={value}>
      {children}
    </PlayRecordsContext.Provider>
  );
}

export function usePlayRecordsContext() {
  return useContext(PlayRecordsContext);
}
