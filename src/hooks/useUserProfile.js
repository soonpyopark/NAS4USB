import { useCallback, useEffect, useRef, useState } from 'react';
import { loadUserDisplayName, saveUserDisplayName } from '../lib/userProfile.js';

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
    const trimmed = nextName.trim();
    draftRef.current = trimmed;
    setDisplayName(trimmed);
    setSaving(true);

    try {
      await saveUserDisplayName(trimmed);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleChange = useCallback((event) => {
    setDisplayName(event.target.value);
  }, []);

  const handleCommit = useCallback(async () => {
    const trimmed = displayName.trim();
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
