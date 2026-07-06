/** @typedef {'rhwp' | 'wb4s' | 'fortune-sheet' | 'tiptap'} EditorCoreId */

/** @typedef {Object} EditorCoreDefinition
 * @property {EditorCoreId} id
 * @property {string} label
 * @property {string} libDir
 * @property {string} submodulePath
 * @property {string} updatePackageDir
 * @property {string} repositoryUrl
 * @property {string | null} [npmPackage]
 * @property {string[]} [npmPackages]
 * @property {string} [overlayDir]
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
    libDir: '.cache/wb4s-src',
    submodulePath: '.cache/wb4s-src',
    updatePackageDir: 'lib/updates/wb4s',
    overlayDir: 'vendor/wb4s-educowork-overlay',
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
  {
    id: 'tiptap',
    label: 'HTML Editor (TipTap)',
    libDir: 'src/lib/tiptap',
    submodulePath: 'src/lib/tiptap',
    updatePackageDir: 'lib/updates/tiptap',
    repositoryUrl: 'https://github.com/ueberdosis/tiptap',
    npmPackage: '@tiptap/react',
    npmPackages: [
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@tiptap/extension-table',
      '@tiptap/extension-placeholder',
    ],
  },
];

export const CORES_MANIFEST_PATH = 'lib/cores-manifest.json';
