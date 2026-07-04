/** @typedef {'rhwp' | 'wb4s'} EditorCoreId */

/** @typedef {Object} EditorCoreDefinition
 * @property {EditorCoreId} id
 * @property {string} label
 * @property {string} libDir
 * @property {string} submodulePath
 * @property {string} updatePackageDir
 * @property {string} repositoryUrl
 * @property {string} npmPackage
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
  },
  {
    id: 'wb4s',
    label: 'Whiteboard (.wb4s)',
    libDir: 'lib/wb4s',
    submodulePath: '.cache/wb4s-src',
    updatePackageDir: 'vendor/wb4s-educowork-overlay',
    repositoryUrl: 'https://github.com/soonpyopark/WhiteBoard4Share',
    npmPackage: null,
  },
];

export const CORES_MANIFEST_PATH = 'lib/cores-manifest.json';
