import { createContext, useContext } from 'react';
import { useAdminAuth } from '../hooks/useAdminAuth.js';

/** @type {import('react').Context<ReturnType<typeof useAdminAuth> | null>} */
const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children, onAuthChange }) {
  const auth = useAdminAuth({ onAuthChange });
  return <AdminAuthContext.Provider value={auth}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuthContext() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuthContext must be used within AdminAuthProvider');
  }
  return context;
}
