import { useCallback, useEffect, useState } from 'react';
import { SHARED_FOLDER } from '../../shared/constants.js';
import { useGuestPermissions } from './useGuestPermissions.js';
import { useAdminAuthContext } from '../context/AdminAuthContext.jsx';
import { isTrashPath } from '../lib/trashPaths.js';

/**
 * @param {string} path
 */
function normalizeNavPath(path) {
  const normalized = String(path ?? '').replace(/\\/g, '/').trim();
  if (!normalized || normalized === '.') return SHARED_FOLDER;
  return normalized;
}

/**
 * @param {string} [initialPath]
 */
export function useTrashGuardedNavigate(initialPath = SHARED_FOLDER) {
  const { effectivePermissions } = useGuestPermissions();
  const { isAdminLoggedIn } = useAdminAuthContext();
  const canAccessTrash = Boolean(effectivePermissions.write) || isAdminLoggedIn;
  const [currentPath, setCurrentPath] = useState(() => normalizeNavPath(initialPath));

  const navigate = useCallback(
    (path) => {
      const next = normalizeNavPath(path);
      if (isTrashPath(next) && !canAccessTrash) return;
      setCurrentPath(next);
    },
    [canAccessTrash],
  );

  useEffect(() => {
    if (isTrashPath(currentPath) && !canAccessTrash) {
      setCurrentPath(SHARED_FOLDER);
    }
  }, [currentPath, canAccessTrash]);

  return { currentPath, navigate };
}
