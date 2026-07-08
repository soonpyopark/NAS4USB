/**
 * Verifies block asset cleanup + ZIP pack flow (no Electron).
 * Run: node scripts/test-block-asset-cleanup.mjs
 */
import JSZip from 'jszip';
import { base64ToBytes, bytesToBase64 } from '../src/lib/bytes.js';
import { collectReferencedAssetPaths } from '../src/lib/blocknote/assetCleanup.js';
import { sidecarPathFromBlockUrl, toPackageAssetUrl } from '../src/lib/blocknote/assetUrls.js';
import { getBlockAssetsDir } from '../src/lib/blocknote/uploadFile.js';

const BLOCK_PATH = 'docs/NoName.block';
const ASSETS_DIR = getBlockAssetsDir(BLOCK_PATH);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/** Simulates sidecar state */
function createMockFs(initialFiles = {}) {
  /** @type {Map<string, string>} */
  const files = new Map(Object.entries(initialFiles));
  /** @type {string[]} */
  const deleted = [];

  return {
    files,
    deleted,
    async readDir(dir) {
      const prefix = `${dir}/`;
      const names = [];
      for (const key of files.keys()) {
        if (key.startsWith(prefix) && !key.slice(prefix.length).includes('/')) {
          names.push({ name: key.slice(prefix.length), isDirectory: false });
        }
      }
      if (names.length === 0 && dir !== ASSETS_DIR) throw new Error('ENOENT');
      return names;
    },
    async delete(path) {
      deleted.push(path);
      files.delete(path);
    },
  };
}

/** Mirrors cleanupUnreferencedBlockAssets with mock fs */
async function mockCleanup(blockRelativePath, blocks, fs) {
  const referenced = collectReferencedAssetPaths(blocks, blockRelativePath);
  const assetsDir = getBlockAssetsDir(blockRelativePath);
  let entries = [];
  try {
    entries = await fs.readDir(assetsDir);
  } catch {
    return referenced;
  }
  for (const entry of entries) {
    const assetPath = `${assetsDir}/${entry.name}`;
    if (referenced.has(assetPath)) continue;
    await fs.delete(assetPath);
  }
  return referenced;
}

async function listZipAssetNames(base64) {
  const zip = await JSZip.loadAsync(base64ToBytes(base64));
  return Object.keys(zip.files)
    .filter((p) => p.startsWith('assets/') && !zip.files[p].dir)
    .map((p) => p.slice('assets/'.length))
    .sort();
}

async function packLikeProduction(content, sidecarFiles, title = 'NoName') {
  const { default: packMod } = await import('../src/lib/blocknote/package.js');
  // Use internal pack via packBlockFileFromSidecar pattern without window
  const normalized = content;
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ format: 'blocknote-package', version: 1, title }, null, 2));
  zip.file('document.json', JSON.stringify({ content: normalized }, null, 2));
  for (const [fileName, base64] of Object.entries(sidecarFiles)) {
    zip.file(`assets/${fileName}`, base64ToBytes(base64), { binary: true });
  }
  return bytesToBase64(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}

// --- tests ---

const blocksWithImage = (fileName) => [
  { type: 'image', props: { url: toPackageAssetUrl(fileName) } },
];

const blocksWithVideo = (fileName) => [
  { type: 'video', props: { url: toPackageAssetUrl(fileName) } },
];

const blocksWithFile = (fileName) => [
  { type: 'file', props: { url: toPackageAssetUrl(fileName), name: fileName } },
];

const blocksWithAudio = (fileName) => [
  { type: 'audio', props: { url: toPackageAssetUrl(fileName), name: fileName } },
];

console.log('1) collectReferencedAssetPaths — package URL');
{
  const refs = collectReferencedAssetPaths(blocksWithImage('a.png'), BLOCK_PATH);
  assert(refs.size === 1, 'expected 1 reference');
  assert(refs.has(`${ASSETS_DIR}/a.png`), `expected ${ASSETS_DIR}/a.png`);
}

console.log('2) collectReferencedAssetPaths — legacy stream URL');
{
  const streamUrl = `/api/fs/stream?path=${encodeURIComponent(`${ASSETS_DIR}/b.jpg`)}`;
  const refs = collectReferencedAssetPaths([{ type: 'image', props: { url: streamUrl } }], BLOCK_PATH);
  assert(refs.has(`${ASSETS_DIR}/b.jpg`), 'stream URL should resolve to sidecar path');
}

console.log('3) removed block → no references');
{
  const refs = collectReferencedAssetPaths([{ type: 'paragraph', content: 'hello' }], BLOCK_PATH);
  assert(refs.size === 0, 'paragraph-only doc should reference no assets');
}

console.log('4) mock cleanup deletes orphan sidecar files');
{
  const fs = createMockFs({
    [`${ASSETS_DIR}/keep.png`]: 'AA==',
    [`${ASSETS_DIR}/orphan.png`]: 'BB==',
  });
  await mockCleanup(BLOCK_PATH, blocksWithImage('keep.png'), fs);
  assert(fs.files.has(`${ASSETS_DIR}/keep.png`), 'keep.png should remain');
  assert(!fs.files.has(`${ASSETS_DIR}/orphan.png`), 'orphan.png should be deleted');
  assert(fs.deleted.includes(`${ASSETS_DIR}/orphan.png`), 'orphan should be in deleted list');
}

console.log('5) save simulation: 2 uploads → remove 1 from doc → cleanup → repack');
{
  const fs = createMockFs({
    [`${ASSETS_DIR}/img1.png`]: bytesToBase64(new Uint8Array([1, 2, 3])),
    [`${ASSETS_DIR}/img2.png`]: bytesToBase64(new Uint8Array([4, 5, 6])),
  });

  // User removes img2 block; only img1 remains in document
  await mockCleanup(BLOCK_PATH, blocksWithImage('img1.png'), fs);

  const remaining = {};
  for (const [path, b64] of fs.files) {
    if (path.startsWith(`${ASSETS_DIR}/`)) {
      remaining[path.slice(`${ASSETS_DIR}/`.length)] = b64;
    }
  }

  const packed = await packLikeProduction(blocksWithImage('img1.png'), remaining);
  const names = await listZipAssetNames(packed);
  assert(names.length === 1 && names[0] === 'img1.png', `ZIP should only contain img1.png, got: ${names.join(',')}`);
}

console.log('6) video/audio/file block URLs are tracked the same way');
{
  const videoRefs = collectReferencedAssetPaths(blocksWithVideo('clip.mp4'), BLOCK_PATH);
  const audioRefs = collectReferencedAssetPaths(blocksWithAudio('track.mp3'), BLOCK_PATH);
  const fileRefs = collectReferencedAssetPaths(blocksWithFile('doc.pdf'), BLOCK_PATH);
  assert(videoRefs.has(`${ASSETS_DIR}/clip.mp4`), 'video url should be tracked');
  assert(audioRefs.has(`${ASSETS_DIR}/track.mp3`), 'audio url should be tracked');
  assert(fileRefs.has(`${ASSETS_DIR}/doc.pdf`), 'file url should be tracked');
}

console.log('8) mixed media cleanup keeps only referenced assets');
{
  const fs = createMockFs({
    [`${ASSETS_DIR}/clip.mp4`]: bytesToBase64(new Uint8Array([1])),
    [`${ASSETS_DIR}/track.mp3`]: bytesToBase64(new Uint8Array([2])),
    [`${ASSETS_DIR}/doc.pdf`]: bytesToBase64(new Uint8Array([3])),
  });

  const doc = [
    ...blocksWithVideo('clip.mp4'),
    ...blocksWithAudio('track.mp3'),
  ];
  await mockCleanup(BLOCK_PATH, doc, fs);

  assert(fs.files.has(`${ASSETS_DIR}/clip.mp4`), 'video should remain');
  assert(fs.files.has(`${ASSETS_DIR}/track.mp3`), 'audio should remain');
  assert(!fs.files.has(`${ASSETS_DIR}/doc.pdf`), 'unreferenced pdf should be deleted');
}

console.log('7) external URL is not treated as sidecar asset');
{
  const refs = collectReferencedAssetPaths(
    [{ type: 'image', props: { url: 'https://example.com/photo.png' } }],
    BLOCK_PATH,
  );
  assert(refs.size === 0, 'external URLs should not reference sidecar');
  assert(sidecarPathFromBlockUrl('https://example.com/photo.png', BLOCK_PATH) === null, 'no sidecar path');
}

console.log('\nAll block asset cleanup checks passed.');
