import { DEFAULT_DEPARTMENT_CODE, DEPARTMENT_CODE_PATTERN } from '../../shared/constants.js';

export { DEFAULT_DEPARTMENT_CODE, DEPARTMENT_CODE_PATTERN };

/**
 * @param {string} name
 */
export function isDepartmentCode(name) {
  return DEPARTMENT_CODE_PATTERN.test(name);
}

/**
 * @param {string} relativePath
 * @returns {string | null}
 */
export function getDepartmentFromPath(relativePath) {
  if (relativePath === '.') return null;
  const [first] = relativePath.split('/');
  return isDepartmentCode(first) ? first : null;
}
