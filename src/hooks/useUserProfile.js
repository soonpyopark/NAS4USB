import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminAuthContext } from '../context/AdminAuthContext.jsx';
import {
  createDefaultDisplayName,
  loadUserDisplayName,
  normalizeDisplayName,
  saveUserDisplayName,
  USER_NAME_PREFIX,
} from '../lib/userProfile.js';

const GUEST_NAME_BACKUP_KEY = 'nas4usb.guestDisplayName';
const ADMIN_ID_STORAGE_KEY = 'nas4usb.adminSession';

function readGuestNameBackup() {
  try {
    const saved = localStorage.getItem(GUEST_NAME_BACKUP_KEY);
    return typeof saved === 'string' && saved.trim() ? saved.trim() : null;
  } catch {
    return null;
  }
}

function writeGuestNameBackup(name) {
  try {
    localStorage.setItem(GUEST_NAME_BACKUP_KEY, name);
  } catch {
    // ignore
  }
}

function readStoredAdminId() {
  try {
    return sessionStorage.getItem(ADMIN_ID_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function useUserProfile() {
  const { adminId, isLoggedIn } = useAdminAuthContext();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const draftRef = useRef('');
  const guestNameRef = useRef('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const name = await loadUserDisplayName();
        if (cancelled) return;

        const backup = readGuestNameBackup();
        guestNameRef.current =
          backup || (name.startsWith(USER_NAME_PREFIX) ? name : createDefaultDisplayName());

        const storedAdminId = readStoredAdminId();
        if (storedAdminId) {
          draftRef.current = storedAdminId;
          setDisplayName(storedAdminId);
        } else {
          const guestName = name.startsWith(USER_NAME_PREFIX) ? name : guestNameRef.current;
          draftRef.current = guestName;
          setDisplayName(guestName);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return undefined;
    let cancelled = false;

    async function syncWithAuth() {
      if (isLoggedIn && adminId) {
        const current = draftRef.current;
        if (current.startsWith(USER_NAME_PREFIX)) {
          guestNameRef.current = current;
          writeGuestNameBackup(current);
        } else if (!guestNameRef.current) {
          const backup = readGuestNameBackup() || createDefaultDisplayName();
          guestNameRef.current = backup;
          writeGuestNameBackup(backup);
        }

        if (draftRef.current === adminId) return;
        draftRef.current = adminId;
        setDisplayName(adminId);
        setSaving(true);
        try {
          await saveUserDisplayName(adminId);
        } finally {
          if (!cancelled) setSaving(false);
        }
        return;
      }

      const guestName =
        guestNameRef.current || readGuestNameBackup() || createDefaultDisplayName();
      guestNameRef.current = guestName;
      if (draftRef.current === guestName) return;
      draftRef.current = guestName;
      setDisplayName(guestName);
      setSaving(true);
      try {
        await saveUserDisplayName(guestName);
      } finally {
        if (!cancelled) setSaving(false);
      }
    }

    void syncWithAuth();
    return () => {
      cancelled = true;
    };
  }, [adminId, isLoggedIn, loading]);

  const persistDisplayName = useCallback(async (nextName) => {
    const normalized = normalizeDisplayName(nextName);
    draftRef.current = normalized;
    setDisplayName(normalized);
    if (normalized.startsWith(USER_NAME_PREFIX)) {
      guestNameRef.current = normalized;
      writeGuestNameBackup(normalized);
    }
    setSaving(true);

    try {
      await saveUserDisplayName(normalized);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleChange = useCallback(
    (event) => {
      if (isLoggedIn) return;
      setDisplayName(event.target.value);
    },
    [isLoggedIn],
  );

  const handleCommit = useCallback(async () => {
    if (isLoggedIn) return;
    const trimmed = displayName.trim();
    if (!trimmed || trimmed === USER_NAME_PREFIX) {
      setDisplayName(draftRef.current);
      return;
    }
    if (trimmed === draftRef.current) return;
    await persistDisplayName(trimmed);
  }, [displayName, isLoggedIn, persistDisplayName]);

  const handleKeyDown = useCallback(
    (event) => {
      if (isLoggedIn) return;
      if (event.key === 'Enter') {
        event.currentTarget.blur();
      }
    },
    [isLoggedIn],
  );

  return {
    displayName,
    loading,
    saving,
    readOnly: isLoggedIn,
    handleChange,
    handleCommit,
    handleKeyDown,
  };
}
