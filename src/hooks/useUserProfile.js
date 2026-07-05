import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadUserDisplayName,
  normalizeDisplayName,
  saveUserDisplayName,
  USER_NAME_PREFIX,
} from '../lib/userProfile.js';

export function useUserProfile() {
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const draftRef = useRef('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const name = await loadUserDisplayName();
        if (!cancelled) {
          draftRef.current = name;
          setDisplayName(name);
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

  const persistDisplayName = useCallback(async (nextName) => {
    const normalized = normalizeDisplayName(nextName);
    draftRef.current = normalized;
    setDisplayName(normalized);
    setSaving(true);

    try {
      await saveUserDisplayName(normalized);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleChange = useCallback((event) => {
    setDisplayName(event.target.value);
  }, []);

  const handleCommit = useCallback(async () => {
    const trimmed = displayName.trim();
    if (!trimmed || trimmed === USER_NAME_PREFIX) {
      setDisplayName(draftRef.current);
      return;
    }
    if (trimmed === draftRef.current) return;
    await persistDisplayName(trimmed);
  }, [displayName, persistDisplayName]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter') {
        event.currentTarget.blur();
      }
    },
    [],
  );

  return {
    displayName,
    loading,
    saving,
    handleChange,
    handleCommit,
    handleKeyDown,
  };
}
