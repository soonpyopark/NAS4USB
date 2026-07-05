/** @typedef {'rhwp' | 'wb4s' | 'fortune-sheet'} EditorCoreId */

/** @typedef {Object} EditorCoreDefinition
 * @property {EditorCoreId} id
 * @property {string} label
 * @property {string} libDir
 * @property {string} submodulePath
 * @property {string} updatePackageDir
 * @property {string} repositoryUrl
 * @property {string | null} [npmPackage]
 * @property {string[]} [npmPackages]
 */

/** @type {EditorCoreDefinition[]} */
export const EDITOR_CORES = [
  {
    id: 'rhwp',
    label: 'HWPX Editor (rhwp)',
    libDir: 'lib/rhwp',
    submodulePath: 'lib/rhwp',
    updatePackageDir: 'lib/updates/rhwp',
    repositoryUrl: 'https://github.com/edwardkim/rhwp',
    npmPackage: '@rhwp/editor',
    npmPackages: ['@rhwp/core', '@rhwp/editor'],
  },
  {
    id: 'wb4s',
    label: 'Whiteboard (.wb4s)',
    libDir: 'src/wb4s',
    submodulePath: 'vendor/whiteboard4share',
    updatePackageDir: 'vendor/wb4s-educowork-overlay',
    repositoryUrl: 'https://github.com/soonpyopark/WhiteBoard4Share',
    npmPackage: null,
  },
  {
    id: 'fortune-sheet',
    label: 'Spreadsheet (.xlsx/.xls)',
    libDir: 'src/lib/xlsx',
    submodulePath: 'src/lib/xlsx',
    updatePackageDir: 'lib/updates/fortune-sheet',
    repositoryUrl: 'https://github.com/ruilisi/fortune-sheet',
    npmPackage: '@fortune-sheet/react',
    npmPackages: ['@fortune-sheet/react'],
  },
];

export const CORES_MANIFEST_PATH = 'lib/cores-manifest.json';
