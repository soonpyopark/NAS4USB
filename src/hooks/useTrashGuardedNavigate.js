import { useCallback, useEffect, useState } from 'react';
import { useGuestPermissions } from './useGuestPermissions.js';
import { isTrashPath } from '../lib/trashPaths.js';

/**
 * @param {string} [initialPath]
 */
export function useTrashGuardedNavigate(initialPath = '.') {
  const { effectivePermissions } = useGuestPermissions();
  const canAccessTrash = effectivePermissions.write;
  const [currentPath, setCurrentPath] = useState(initialPath);

  const navigate = useCallback(
    (path) => {
      if (isTrashPath(path) && !canAccessTrash) return;
      setCurrentPath(path);
    },
    [canAccessTrash],
  );

  useEffect(() => {
    if (isTrashPath(currentPath) && !canAccessTrash) {
      setCurrentPath('.');
    }
  }, [currentPath, canAccessTrash]);

  return { currentPath, navigate };
}
