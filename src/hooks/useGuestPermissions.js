import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_GUEST_PERMISSIONS,
  DEFAULT_LOGGED_IN_PERMISSIONS,
} from '../../shared/guestPermissions.js';
import { useAdminAuthContext } from '../context/AdminAuthContext.jsx';
import { useFsSync } from '../context/FsSyncContext.jsx';

/**
 * @returns {{
 *   guestPermissions: import('../../shared/guestPermissions.js').AccessPermissionFlags,
 *   loggedInPermissions: import('../../shared/guestPermissions.js').AccessPermissionFlags,
 *   effectivePermissions: import('../../shared/guestPermissions.js').AccessPermissionFlags,
 *   refreshGuestPermissions: () => Promise<void>,
 * }}
 */
export function useGuestPermissions() {
  const { isAdminLoggedIn } = useAdminAuthContext();
  const { generation } = useFsSync();
  const [guestPermissions, setGuestPermissions] = useState({ ...DEFAULT_GUEST_PERMISSIONS });
  const [loggedInPermissions, setLoggedInPermissions] = useState({
    ...DEFAULT_LOGGED_IN_PERMISSIONS,
  });

  const refreshGuestPermissions = useCallback(async () => {
    try {
      if (!window.nas4usb?.settings?.getGuestPermissions) {
        setGuestPermissions({ ...DEFAULT_GUEST_PERMISSIONS });
        setLoggedInPermissions({ ...DEFAULT_LOGGED_IN_PERMISSIONS });
        return;
      }
      const next = await window.nas4usb.settings.getGuestPermissions();
      const guest = next?.guestPermissions ?? next;
      const loggedIn = next?.loggedInPermissions ?? DEFAULT_LOGGED_IN_PERMISSIONS;
      setGuestPermissions({
        view: guest?.view !== false,
        read: guest?.read !== false,
        write: guest?.write !== false,
      });
      setLoggedInPermissions({
        view: loggedIn?.view !== false,
        read: loggedIn?.read !== false,
        write: loggedIn?.write !== false,
      });
    } catch {
      setGuestPermissions({ ...DEFAULT_GUEST_PERMISSIONS });
      setLoggedInPermissions({ ...DEFAULT_LOGGED_IN_PERMISSIONS });
    }
  }, []);

  useEffect(() => {
    void refreshGuestPermissions();
  }, [refreshGuestPermissions, isAdminLoggedIn, generation]);

  const effectivePermissions = useMemo(
    () => (isAdminLoggedIn ? loggedInPermissions : guestPermissions),
    [isAdminLoggedIn, loggedInPermissions, guestPermissions],
  );

  return {
    guestPermissions,
    loggedInPermissions,
    effectivePermissions,
    refreshGuestPermissions,
  };
}
