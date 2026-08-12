/**
 * Prepare TipTap → HWPX export toolchain:
 * - sync vendored pypandoc-hwpx into tools/hwpx-export/vendor
 * - download pandoc Windows binary (if missing)
 * - pip install --target pydeps: pypandoc, pillow
 *
 * Requires Python 3 on PATH (`python` or `py -3`).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const extractZip = require('extract-zip');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const exportRoot = path.join(projectRoot, 'tools', 'hwpx-export');
const vendorSrc = path.join(projectRoot, 'vendor', 'pypandoc-hwpx', 'pypandoc_hwpx');
const vendorDstRoot = path.join(exportRoot, 'vendor');
const vendorDst = path.join(vendorDstRoot, 'pypandoc_hwpx');
const pydepsDir = path.join(exportRoot, 'pydeps');
const pandocDir = path.join(exportRoot, 'pandoc');

const PANDOC_VERSION = '3.10.1';
const PANDOC_ZIP_URL = `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-windows-x86_64.zip`;
const PANDOC_VERSION_MARKER = path.join(pandocDir, 'VERSION');

/**
 * @param {string} src
 * @param {string} dest
 */
async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else if (entry.isFile()) {
      await fs.copyFile(from, to);
    }
  }
}

function resolvePython() {
  const tries = [
    ['python', ['--version']],
    ['py', ['-3', '--version']],
  ];
  for (const [cmd, args] of tries) {
    const result = spawnSync(cmd, args, { encoding: 'utf8', shell: false });
    if (result.status === 0) {
      return cmd === 'py' ? { cmd: 'py', prefix: ['-3'] } : { cmd: 'python', prefix: [] };
    }
  }
  return null;
}

/**
 * @param {string} url
 * @param {string} destFile
 */
async function downloadFile(url, destFile) {
  await fs.mkdir(path.dirname(destFile), { recursive: true });
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  const fileStream = createWriteStream(destFile);
  // @ts-expect-error Node fetch body is a web stream; pipeline accepts it in Node 20+
  await pipeline(res.body, fileStream);
}

async function ensurePandoc() {
  const exePath = path.join(pandocDir, 'pandoc.exe');
  try {
    const marker = (await fs.readFile(PANDOC_VERSION_MARKER, 'utf8')).trim();
    await fs.access(exePath);
    if (marker === PANDOC_VERSION) {
      console.log(`[prepare:hwpx-export] pandoc.exe ${PANDOC_VERSION} already present`);
      return;
    }
    console.log(
      `[prepare:hwpx-export] pandoc ${marker || 'unknown'} → ${PANDOC_VERSION}, re-downloading…`,
    );
  } catch {
    // download / extract
  }

  if (process.platform !== 'win32') {
    console.warn(
      '[prepare:hwpx-export] Bundled pandoc download is Windows-only; install pandoc on PATH for other OS.',
    );
    return;
  }

  const zipPath = path.join(exportRoot, `pandoc-${PANDOC_VERSION}.zip`);
  try {
    await fs.access(zipPath);
    console.log('[prepare:hwpx-export] reusing downloaded pandoc zip');
  } catch {
    console.log(`[prepare:hwpx-export] downloading pandoc ${PANDOC_VERSION}…`);
    await downloadFile(PANDOC_ZIP_URL, zipPath);
  }

  const unpackDir = path.join(exportRoot, `_pandoc_unpack`);
  await fs.rm(unpackDir, { recursive: true, force: true });
  await fs.mkdir(unpackDir, { recursive: true });

  // Prefer tar (Windows 10+) — extract-zip can stall on large binaries.
  console.log('[prepare:hwpx-export] extracting pandoc…');
  const tarResult = spawnSync('tar', ['-xf', zipPath, '-C', unpackDir], {
    encoding: 'utf8',
    shell: false,
  });
  if (tarResult.status !== 0) {
    console.warn('[prepare:hwpx-export] tar extract failed, falling back to extract-zip');
    await extractZip(zipPath, { dir: unpackDir });
  }

  async function findPandocExe(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === 'pandoc.exe') return full;
      if (entry.isDirectory()) {
        const nested = await findPandocExe(full);
        if (nested) return nested;
      }
    }
    return null;
  }

  const found = await findPandocExe(unpackDir);
  if (!found) {
    throw new Error('pandoc.exe not found in downloaded archive');
  }

  await fs.rm(pandocDir, { recursive: true, force: true });
  await fs.mkdir(pandocDir, { recursive: true });
  await fs.copyFile(found, exePath);
  await fs.writeFile(PANDOC_VERSION_MARKER, `${PANDOC_VERSION}\n`, 'utf8');
  await fs.rm(unpackDir, { recursive: true, force: true });
  try {
    const entries = await fs.readdir(exportRoot);
    await Promise.all(
      entries
        .filter((name) => /^pandoc-\d.+\.zip$/i.test(name) && name !== path.basename(zipPath))
        .map((name) => fs.rm(path.join(exportRoot, name), { force: true })),
    );
  } catch {
    // ignore cleanup errors
  }
  console.log(
    `[prepare:hwpx-export] pandoc ${PANDOC_VERSION} → ${path.relative(projectRoot, exePath)}`,
  );
}

async function ensurePyDeps(python) {
  await fs.mkdir(pydepsDir, { recursive: true });
  const marker = path.join(pydepsDir, 'pypandoc', '__init__.py');
  try {
    await fs.access(marker);
    console.log('[prepare:hwpx-export] pydeps already present');
    return;
  } catch {
    // install
  }

  console.log('[prepare:hwpx-export] pip install pypandoc pillow → pydeps…');
  execFileSync(
    python.cmd,
    [
      ...python.prefix,
      '-m',
      'pip',
      'install',
      '--upgrade',
      '--target',
      pydepsDir,
      'pypandoc',
      'pillow',
    ],
    { stdio: 'inherit', cwd: projectRoot },
  );
}

async function main() {
  try {
    await fs.access(vendorSrc);
  } catch {
    console.log('[prepare:hwpx-export] cloning msjang/pypandoc-hwpx…');
    await fs.mkdir(path.dirname(vendorSrc), { recursive: true });
    execFileSync(
      'git',
      ['clone', '--depth', '1', 'https://github.com/msjang/pypandoc-hwpx.git', path.join(projectRoot, 'vendor', 'pypandoc-hwpx')],
      { stdio: 'inherit', cwd: projectRoot },
    );
  }
  await fs.access(vendorSrc);
  await fs.rm(vendorDstRoot, { recursive: true, force: true });
  await fs.mkdir(vendorDstRoot, { recursive: true });
  await copyDir(vendorSrc, vendorDst);
  console.log(`[prepare:hwpx-export] synced pypandoc_hwpx → ${path.relative(projectRoot, vendorDst)}`);

  const python = resolvePython();
  if (!python) {
    throw new Error(
      'Python 3 not found (tried `python` and `py -3`). Install Python to enable TipTap HWPX export.',
    );
  }
  console.log(`[prepare:hwpx-export] using ${python.cmd} ${python.prefix.join(' ')}`.trim());

  await ensurePandoc();
  await ensurePyDeps(python);
  console.log('[prepare:hwpx-export] ready');
}

main().catch((error) => {
  console.error('[prepare:hwpx-export] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
