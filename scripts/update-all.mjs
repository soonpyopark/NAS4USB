import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateEditorCores } from '../electron/editorUpdater.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  return {
    skipGit: argv.includes('--skip-git'),
    skipNpm: argv.includes('--skip-npm'),
    skipMajors: argv.includes('--skip-majors'),
    skipCores: argv.includes('--skip-cores'),
    build: argv.includes('--build'),
    force: argv.includes('--force'),
  };
}

/**
 * @param {string} label
 * @param {string} command
 * @param {string[]} args
 */
function run(label, command, args) {
  console.log(`[update-all] ${label}…`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status ?? 1})`);
  }
}

async function clearForcedCaches() {
  const wb4sCache = path.join(root, '.cache', 'wb4s-src');
  try {
    await fs.rm(wb4sCache, { recursive: true, force: true });
    console.log('[update-all] cleared .cache/wb4s-src (force)');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[update-all] could not clear wb4s cache: ${message}`);
  }
}

async function gitPull() {
  try {
    await fs.access(path.join(root, '.git'));
  } catch {
    console.log('[update-all] Not a git repo; skip git pull');
    return;
  }

  const status = spawnSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (status.stdout?.trim()) {
    console.log('[update-all] Git working tree has local changes; skip git pull');
    return;
  }

  run('git pull', 'git', ['pull', '--ff-only']);
}

function queryNpmVersion(pkg) {
  const result = spawnSync('npm', ['view', pkg, 'version'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const version = result.stdout?.trim();
  if (result.status !== 0 || !version) {
    throw new Error(`npm view ${pkg} version failed`);
  }
  return version;
}

function electronBinaryPath() {
  if (process.platform === 'win32') {
    return path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
  }
  if (process.platform === 'darwin') {
    return path.join(
      root,
      'node_modules',
      'electron',
      'dist',
      'Electron.app',
      'Contents',
      'MacOS',
      'Electron',
    );
  }
  return path.join(root, 'node_modules', 'electron', 'dist', 'electron');
}

/**
 * Running NAS4USB / project Electron locks node_modules and the installed exe.
 * Updating while they run leaves a broken binary and the next launch fails.
 */
function stopRunningApp() {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/IM', 'NAS4USB.exe', '/T', '/F'], { stdio: 'ignore' });
    const filter = JSON.stringify(`${root}\\*`);
    const ps = [
      `Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |`,
      `Where-Object { $_.ExecutablePath -and $_.ExecutablePath -like ${filter} } |`,
      'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    ].join(' ');
    spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
    return;
  }

  spawnSync('pkill', ['-f', path.join(root, 'node_modules', 'electron')], { stdio: 'ignore' });
}

async function writeElectronAllowScripts(version) {
  const pkgPath = path.join(root, 'package.json');
  let text = await fs.readFile(pkgPath, 'utf8');
  if (/"electron@[^"]+"\s*:\s*true/.test(text)) {
    text = text.replace(/"electron@[^"]+"\s*:\s*true/, `"electron@${version}": true`);
  } else if (/"allowScripts"\s*:\s*\{/.test(text)) {
    text = text.replace(/("allowScripts"\s*:\s*\{)/, `$1\n    "electron@${version}": true,`);
  } else {
    throw new Error('package.json is missing allowScripts; cannot install Electron');
  }
  await fs.writeFile(pkgPath, text);
  console.log(`[update-all] allowScripts electron@${version}`);
}

function assertElectronRuns(expectedVersion) {
  const binary = electronBinaryPath();
  const result = spawnSync(binary, ['--version'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20000,
  });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.status !== 0) {
    throw new Error(
      `Electron ${expectedVersion} did not start after update (${out || `exit ${result.status}`}). ` +
        'Refusing to leave a broken install.',
    );
  }
  console.log(`[update-all] Electron runs: ${out}`);
}

/**
 * @param {unknown} spec
 */
function isInstallableRegistrySpec(spec) {
  const value = String(spec || '').trim();
  if (!value) return false;
  if (/^(file|link|workspace|npm):/i.test(value)) return false;
  if (/^https?:\/\//i.test(value)) return false;
  if (/^git(\+|$)/i.test(value)) return false;
  return true;
}

/**
 * @param {{ dependencies?: Record<string, string>, devDependencies?: Record<string, string> }} pkg
 */
/**
 * Latest majors that break the packaged Electron broker.
 * y-websocket 3 dropped `./bin/utils` (ERR_PACKAGE_PATH_NOT_EXPORTED);
 * `@y/websocket-server` 0.1.2+ targets Yjs 14.
 */
const MAJOR_HOLD_PACKAGES = new Set(['y-websocket']);

function collectDirectPackageNames(pkg) {
  /** @type {string[]} */
  const names = [];
  for (const field of ['dependencies', 'devDependencies']) {
    const block = pkg[field] && typeof pkg[field] === 'object' ? pkg[field] : {};
    for (const [name, spec] of Object.entries(block)) {
      if (isInstallableRegistrySpec(spec)) names.push(name);
    }
  }
  return [...new Set(names)].sort();
}

/**
 * `npm update` stays inside package.json ranges (`^18` never becomes 19).
 * Reinstall every direct dependency at `@latest` so majors move too.
 */
async function updateDirectPackagesLatest() {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const allNames = collectDirectPackageNames(pkg);
  const names = allNames.filter((name) => !MAJOR_HOLD_PACKAGES.has(name));
  const held = allNames.filter((name) => MAJOR_HOLD_PACKAGES.has(name));
  if (held.length > 0) {
    console.log(`[update-all] holding majors: ${held.join(', ')}`);
  }
  if (names.length === 0) {
    console.log('[update-all] no registry packages to bump');
    return;
  }
  console.log(`[update-all] ${names.length} direct packages → @latest (majors included)`);
  run('npm latest (majors)', 'npm', ['install', ...names.map((name) => `${name}@latest`)]);
}

async function finalizeElectron(expectedVersion) {
  try {
    await fs.access(electronBinaryPath());
  } catch {
    console.log('[update-all] Electron binary missing; running install.js…');
    run('electron install.js', 'node', [path.join('node_modules', 'electron', 'install.js')]);
  }
  assertElectronRuns(expectedVersion);
}

/**
 * Range update, then either all `@latest` (majors) or Electron-only latest.
 * `allowScripts` is rewritten before Electron is installed.
 */
async function updateNpmStack({ skipMajors = false } = {}) {
  run('npm install', 'npm', ['install']);
  run('npm update', 'npm', ['update']);

  const electronVersion = queryNpmVersion('electron');
  await writeElectronAllowScripts(electronVersion);

  if (skipMajors) {
    const builderVersion = queryNpmVersion('electron-builder');
    run('electron latest', 'npm', ['install', `electron@${electronVersion}`, '--save-dev']);
    run('electron-builder latest', 'npm', ['install', `electron-builder@${builderVersion}`, '--save-dev']);
  } else {
    await updateDirectPackagesLatest();
  }

  await finalizeElectron(electronVersion);
}

/**
 * @param {ReturnType<typeof parseArgs>} opts
 */
async function updateEditorStacks(opts) {
  if (opts.force) {
    await clearForcedCaches();
  }

  console.log('[update-all] Updating editor cores (rhwp, wb4s, fortune-sheet, tiptap, comic-reader)…');
  const result = await updateEditorCores(root);

  for (const item of result.results) {
    const tag = item.success ? 'OK' : 'FAIL';
    console.log(`[update-all]   ${item.id}: ${tag} — ${item.message}`);
  }

  if (!result.success && !result.partial) {
    throw new Error('All editor core updates failed');
  }

  run('build rhwp studio', 'npm', ['run', 'build:rhwp-studio']);
  run('prepare wb4s src', 'npm', ['run', 'prepare:wb4s-src']);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('[update-all] ===== started =====');
  console.log(`[update-all] Project root: ${root}`);

  run('stop dev server', 'node', ['scripts/dev-process.mjs', 'stop']);
  console.log('[update-all] Stopping running NAS4USB / project Electron…');
  stopRunningApp();

  if (!opts.skipGit) {
    await gitPull();
  }

  if (!opts.skipNpm) {
    await updateNpmStack({ skipMajors: opts.skipMajors });
  }

  if (!opts.skipCores) {
    await updateEditorStacks(opts);
  }

  run('prepare icons', 'npm', ['run', 'prepare:icons']);

  if (opts.build) {
    run('build dist exe', 'npm', ['run', 'build:dist:exe']);
  }

  console.log('[update-all] ===== finished =====');
}

main().catch((error) => {
  console.error('[update-all] ERROR:', error instanceof Error ? error.message : error);
  process.exit(1);
});
