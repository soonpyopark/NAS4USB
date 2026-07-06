import { useCallback, useEffect, useState } from 'react';
import { useAdminAuthContext } from '../context/AdminAuthContext.jsx';
import { isTrashPath } from '../lib/trashPaths.js';

/**
 * @param {string} [initialPath]
 */
export function useTrashGuardedNavigate(initialPath = '.') {
  const { isAdminLoggedIn } = useAdminAuthContext();
  const [currentPath, setCurrentPath] = useState(initialPath);

  const navigate = useCallback(
    (path) => {
      if (isTrashPath(path) && !isAdminLoggedIn) return;
      setCurrentPath(path);
    },
    [isAdminLoggedIn],
  );

  useEffect(() => {
    if (isTrashPath(currentPath) && !isAdminLoggedIn) {
      setCurrentPath('.');
    }
  }, [currentPath, isAdminLoggedIn]);

  return { currentPath, navigate };
}
