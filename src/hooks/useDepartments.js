import { useCallback, useEffect, useState } from 'react';
import { isDepartmentCode } from '../lib/departments.js';

/**
 * Scan data root for department folders (7-digit codes).
 */
export function useDepartments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await window.educowork.fs.readDir('.');
      const codes = entries
        .filter((entry) => entry.isDirectory && isDepartmentCode(entry.name))
        .map((entry) => entry.name)
        .sort();
      setDepartments(codes);
    } catch {
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { departments, loading, refresh };
}
