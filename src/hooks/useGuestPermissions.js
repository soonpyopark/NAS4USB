import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_GUEST_PERMISSIONS } from '../../shared/guestPermissions.js';
import { useAdminAuthContext } from '../context/AdminAuthContext.jsx';
import { useFsSync } from '../context/FsSyncContext.jsx';

/**
 * @returns {{
 *   effectivePermissions: import('../../shared/guestPermissions.js').AccessPermissionFlags,
 *   refreshGuestPermissions: () => Promise<void>,
 * }}
 */
export function useGuestPermissions() {
  const { isAdminLoggedIn, adminId } = useAdminAuthContext();
  const { generation } = useFsSync();
  const [effectivePermissions, setEffectivePermissions] = useState({
    ...DEFAULT_GUEST_PERMISSIONS,
  });

  const refreshGuestPermissions = useCallback(async () => {
    try {
      if (!window.nas4usb?.settings?.getGuestPermissions) {
        setEffectivePermissions({ ...DEFAULT_GUEST_PERMISSIONS });
        return;
      }
      const next = await window.nas4usb.settings.getGuestPermissions();
      const effective = next?.effectivePermissions ?? next?.guestPermissions ?? next;
      setEffectivePermissions({
        view: effective?.view !== false,
        read: effective?.read !== false,
        write: effective?.write !== false,
      });
    } catch {
      setEffectivePermissions({ ...DEFAULT_GUEST_PERMISSIONS });
    }
  }, []);

  useEffect(() => {
    void refreshGuestPermissions();
  }, [refreshGuestPermissions, isAdminLoggedIn, adminId, generation]);

  return {
    effectivePermissions,
    refreshGuestPermissions,
  };
}
