import { useEffect, useState } from 'react';

export function useAppInfo() {
  const [paths, setPaths] = useState(null);
  const [syncInfo, setSyncInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [pathInfo, sync] = await Promise.all([
          window.educowork.getPaths(),
          window.educowork.getSyncInfo(),
        ]);

        if (!cancelled) {
          setPaths(pathInfo);
          setSyncInfo(sync);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load app info');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { paths, syncInfo, loading, error };
}
