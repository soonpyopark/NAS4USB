import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CORES_MANIFEST_PATH, EDITOR_CORES } from '../shared/editorCores.js';

/**
 * Packaged apps keep node_modules inside the asar (installRoot),
 * while portableRoot is the USB/exe folder (lib/, data/, …).
 * @param {string} portableRoot
 * @param {string} [installRoot]
 */
function resolveRoots(portableRoot, installRoot = portableRoot) {
  if (!installRoot || installRoot === portableRoot) {
    return [portableRoot];
  }
  return [installRoot, portableRoot];
}

/**
 * @param {string} label
 */
function extractVersionTokens(label) {
  if (!label || label === 'not-installed' || label === 'unknown' || label === '확인 불가') {
    return [];
  }
  return [...String(label).matchAll(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/g)].map((match) => match[0]);
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareSemver(a, b) {
  const pa = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * @param {string[]} tokens
 */
function maxSemver(tokens) {
  return tokens.reduce((best, token) => {
    if (!best) return token;
    return compareSemver(token, best) > 0 ? token : best;
  }, /** @type {string|null} */ (null));
}

/**
 * @param {string} current
 * @param {string | null} available
 */
function isUpdateAvailable(current, available) {
  if (!available || available === '확인 불가') return false;
  if (!current || current === 'not-installed' || current === 'unknown') return true;

  const currentTokens = extractVersionTokens(current);
  const availableTokens = extractVersionTokens(available);
  if (availableTokens.length === 0) {
    // e.g. GitHub tag "WhiteBoard4Share" with no semver — not a usable update signal
    return false;
  }
  if (currentTokens.length === 0) {
    return true;
  }

  const currentMax = maxSemver(currentTokens);
  const availableMax = maxSemver(availableTokens);
  if (!currentMax || !availableMax) {
    return current.trim() !== available.trim();
  }
  return compareSemver(availableMax, currentMax) > 0;
}

/**
 * @param {string} appPath
 * @param {string} relativePath
 */
async function pathExists(appPath, relativePath) {
  try {
    await fs.access(path.join(appPath, relativePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} appPath
 */
async function isGitRepository(appPath) {
  return pathExists(appPath, '.git');
}

/**
 * @param {string} appPath
 * @param {string} submodulePath
 */
async function hasSubmoduleCheckout(appPath, submodulePath) {
  if (!(await pathExists(appPath, path.join(submodulePath, '.git')))) {
    if (!(await pathExists(appPath, '.gitmodules'))) return false;
  }
  return pathExists(appPath, submodulePath);
}

/**
 * @param {string} cwd
 * @param {string[]} args
 */
function runCommand(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), {
      cwd,
      shell: process.platform === 'win32',
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `Command failed (${code}): ${args.join(' ')}`));
    });
  });
}

/**
 * @param {import('../shared/editorCores.js').EditorCoreDefinition} core
 */
function getNpmPackages(core) {
  if (Array.isArray(core.npmPackages) && core.npmPackages.length > 0) {
    return core.npmPackages;
  }
  if (core.npmPackage) {
    return [core.npmPackage];
  }
  return [];
}

/**
 * @param {string} appPath
 * @param {string} packageName
 */
async function readNpmPackageVersion(appPath, packageName) {
  const packagePath = path.join(appPath, 'node_modules', packageName, 'package.json');
  try {
    const raw = await fs.readFile(packagePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.version ?? 'unknown';
  } catch {
    return 'not-installed';
  }
}

/**
 * @param {string} appPath
 * @param {import('../shared/editorCores.js').EditorCoreDefinition} core
 */
async function readCoreVersion(appPath, core) {
  return readCoreVersionFromRoots([appPath], core);
}

/**
 * @param {string[]} roots
 * @param {import('../shared/editorCores.js').EditorCoreDefinition} core
 */
async function readCoreVersionFromRoots(roots, core) {
  const npmPackages = getNpmPackages(core);
  if (npmPackages.length > 0) {
    for (const root of roots) {
      const versions = [];
      for (const packageName of npmPackages) {
        const version = await readNpmPackageVersion(root, packageName);
        if (version !== 'not-installed') {
          versions.push(`${packageName}@${version}`);
        }
      }
      if (versions.length > 0) {
        return versions.join(', ');
      }
    }
  }

  for (const root of roots) {
    try {
      const packagePath = path.join(root, core.libDir, 'package.json');
      const raw = await fs.readFile(packagePath, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed.version ?? parsed.name ?? 'unknown';
    } catch {
      // try next root
    }
  }

  return 'not-installed';
}

/**
 * @param {string} packageName
 */
async function fetchNpmLatestVersion(packageName) {
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
}

/**
 * @param {import('../shared/editorCores.js').EditorCoreDefinition} core
 */
async function readAvailableCoreVersion(core) {
  const npmPackages = getNpmPackages(core);
  if (npmPackages.length > 0) {
    const versions = [];
    for (const packageName of npmPackages) {
      const latest = await fetchNpmLatestVersion(packageName);
      if (latest) {
        versions.push(`${packageName}@${latest}`);
      }
    }
    if (versions.length > 0) {
      return versions.join(', ');
    }
  }

  if (core.id === 'wb4s') {
    try {
      const response = await fetch(
        'https://api.github.com/repos/soonpyopark/WhiteBoard4Share/releases/latest',
        { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'NAS4USB' } },
      );
      if (response.ok) {
        const data = await response.json();
        const candidates = [data.tag_name, data.name]
          .filter((value) => typeof value === 'string')
          .map((value) => value.replace(/^v/, ''));
        for (const candidate of candidates) {
          const match = String(candidate).match(/(\d+\.\d+\.\d+)/);
          if (match) return match[1];
        }
        // fall back to tag only when it looks like a version-ish label
        const tag = candidates[0];
        if (tag && /\d/.test(tag)) return tag;
      }
    } catch {
      // offline — available unknown
    }
  }

  return null;
}

/**
 * @param {string} portableRoot USB/exe (or project) root
 * @param {string} [installRoot] asar/project root that contains node_modules
 */
export async function getEditorCoresStatus(portableRoot, installRoot = portableRoot) {
  const roots = resolveRoots(portableRoot, installRoot);
  const projectRoot = roots[roots.length - 1];
  const manifest = await readManifestFromRoots(roots);
  const cores = {};

  for (const core of EDITOR_CORES) {
    let version = await readCoreVersionFromRoots(roots, core);
    if (
      (version === 'not-installed' || version === 'unknown') &&
      typeof manifest?.cores?.[core.id]?.version === 'string' &&
      manifest.cores[core.id].version
    ) {
      version = manifest.cores[core.id].version;
    }

    const availableVersion = await readAvailableCoreVersion(core);
    const hasGit =
      (await isGitRepository(projectRoot)) &&
      (await hasSubmoduleCheckout(projectRoot, core.submodulePath));
    const hasLocalPackage = await pathExists(projectRoot, core.updatePackageDir);

    cores[core.id] = {
      id: core.id,
      label: core.label,
      version,
      availableVersion: availableVersion ?? '확인 불가',
      updateAvailable: isUpdateAvailable(version, availableVersion),
      libDir: core.libDir,
      hasGitSource: hasGit,
      hasLocalUpdatePackage: hasLocalPackage,
      lastUpdatedAt: manifest?.cores?.[core.id]?.updatedAt ?? null,
    };
  }

  return {
    updatedAt: manifest?.updatedAt ?? null,
    cores,
  };
}

/**
 * @param {string} appPath
 */
async function readManifest(appPath) {
  try {
    const raw = await fs.readFile(path.join(appPath, CORES_MANIFEST_PATH), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {string[]} roots
 */
async function readManifestFromRoots(roots) {
  for (const root of roots) {
    const manifest = await readManifest(root);
    if (manifest) return manifest;
  }
  return { updatedAt: null, cores: {} };
}

/**
 * @param {string} appPath
 * @param {Record<string, unknown>} manifest
 */
async function writeManifest(appPath, manifest) {
  const manifestPath = path.join(appPath, CORES_MANIFEST_PATH);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

/**
 * @param {string} appPath
 * @param {import('../shared/editorCores.js').EditorCoreDefinition} core
 */
async function updateCoreViaGit(appPath, core) {
  if (!(await isGitRepository(appPath))) {
    throw new Error('Git 저장소가 아닙니다.');
  }

  await runCommand(appPath, ['git', 'submodule', 'update', '--init', '--recursive', core.submodulePath]);
  await runCommand(appPath, ['git', 'submodule', 'update', '--remote', '--merge', core.submodulePath]);
  return 'git';
}

/**
 * @param {string} appPath
 * @param {string[]} packageNames
 */
async function updateCoreViaNpm(appPath, packageNames) {
  const args = ['npm', 'install', ...packageNames.map((name) => `${name}@latest`)];
  await runCommand(appPath, args);
  return 'npm';
}

/**
 * @param {string} appPath
 * @param {import('../shared/editorCores.js').EditorCoreDefinition} core
 */
async function updateCoreViaLocalPackage(appPath, core) {
  const source = path.join(appPath, core.updatePackageDir);
  const destination = path.join(appPath, core.libDir);

  if (!(await pathExists(appPath, core.updatePackageDir))) {
    throw new Error(`로컬 업데이트 패키지 없음: ${core.updatePackageDir}`);
  }

  await fs.mkdir(destination, { recursive: true });
  await fs.cp(source, destination, { recursive: true, force: true });
  return 'local-package';
}

/**
 * @param {string} appPath
 * @param {import('../shared/editorCores.js').EditorCoreDefinition} core
 */
async function updateWb4sCore(appPath, core) {
  const { syncWb4sEngine, buildWb4sEditorBundle } = await import('../scripts/wb4s-engine.mjs');

  /** @type {string} */
  let method;

  try {
    method = await syncWb4sEngine(appPath, { strategy: 'git', force: true });
  } catch (gitError) {
    if (!(await pathExists(appPath, core.updatePackageDir))) {
      throw gitError;
    }
    method = await syncWb4sEngine(appPath, { strategy: 'local-package', force: true });
  }

  try {
    await buildWb4sEditorBundle(appPath);
    method = `${method}+build`;
  } catch (buildError) {
    console.warn(
      `[editor-update] wb4s embed build skipped: ${
        buildError instanceof Error ? buildError.message : buildError
      }`,
    );
  }

  const version = await readCoreVersion(appPath, core);
  return {
    id: core.id,
    label: core.label,
    success: true,
    method,
    version,
    message: `${core.label} ${version} 반영 완료`,
  };
}

/**
 * @param {string} appPath
 * @param {import('../shared/editorCores.js').EditorCoreDefinition} core
 */
async function updateSingleCore(appPath, core) {
  const previousVersion = await readCoreVersion(appPath, core);

  if (core.id === 'wb4s') {
    const result = await updateWb4sCore(appPath, core);
    return {
      ...result,
      previousVersion,
      message: `${core.label} ${previousVersion} → ${result.version}`,
    };
  }

  /** @type {string|null} */
  let method = null;
  const npmPackages = getNpmPackages(core);
  /** @type {Error[]} */
  const npmErrors = [];

  if (npmPackages.length > 0) {
    try {
      method = await updateCoreViaNpm(appPath, npmPackages);
      const version = await readCoreVersion(appPath, core);
      return {
        id: core.id,
        label: core.label,
        success: true,
        method,
        previousVersion,
        version,
        message: `${core.label} ${previousVersion} → ${version}`,
      };
    } catch (error) {
      if (error instanceof Error) {
        npmErrors.push(error);
      }
      if (core.id === 'fortune-sheet') {
        throw npmErrors[0] ?? new Error(`${core.label} npm 업데이트 실패`);
      }
    }
  }

  if ((await isGitRepository(appPath)) && (await pathExists(appPath, '.gitmodules'))) {
    try {
      method = await updateCoreViaGit(appPath, core);
    } catch (gitError) {
      if (!(await pathExists(appPath, core.updatePackageDir))) {
        if (npmErrors.length > 0) {
          throw npmErrors[0];
        }
        throw gitError;
      }
      method = await updateCoreViaLocalPackage(appPath, core);
    }
  } else if (await pathExists(appPath, core.updatePackageDir)) {
    method = await updateCoreViaLocalPackage(appPath, core);
  } else if (npmErrors.length > 0) {
    throw npmErrors[0];
  } else {
    throw new Error('Git submodule, lib/updates 패키지, 또는 npm 패키지가 필요합니다.');
  }

  const version = await readCoreVersion(appPath, core);
  return {
    id: core.id,
    label: core.label,
    success: true,
    method,
    previousVersion,
    version,
    message: `${core.label} ${previousVersion} → ${version}`,
  };
}

/**
 * Keep adapter package.json / UI version label in sync with npm @rhwp/* versions.
 * @param {string} appPath
 * @param {string} versionLabel
 */
async function syncRhwpAdapterVersion(appPath, versionLabel) {
  const token = extractVersionTokens(versionLabel)[0];
  if (!token) return;

  const adapterPackagePath = path.join(appPath, 'lib', 'rhwp', 'package.json');
  try {
    const raw = await fs.readFile(adapterPackagePath, 'utf8');
    const parsed = JSON.parse(raw);
    parsed.version = token;
    if (parsed.dependencies && typeof parsed.dependencies === 'object') {
      if (parsed.dependencies['@rhwp/editor']) {
        parsed.dependencies['@rhwp/editor'] = `^${token}`;
      }
      if (parsed.dependencies['@rhwp/core']) {
        parsed.dependencies['@rhwp/core'] = `^${token}`;
      }
    }
    await fs.writeFile(adapterPackagePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  } catch {
    // adapter may be absent in some environments
  }

  const labelFiles = [
    path.join(appPath, 'lib', 'rhwp', 'mountRhwp.js'),
    path.join(appPath, 'src', 'components', 'editors', 'HwpxEditorShell.jsx'),
  ];
  for (const filePath of labelFiles) {
    try {
      const text = await fs.readFile(filePath, 'utf8');
      const next = text.replace(
        /const RHWP_VERSION = '[^']+'/,
        `const RHWP_VERSION = '${token}'`,
      );
      if (next !== text) {
        await fs.writeFile(filePath, next, 'utf8');
      }
    } catch {
      // optional labels
    }
  }
}

/**
 * @param {string} appPath
 */
export async function updateEditorCores(appPath) {
  /** @type {Array<Record<string, unknown>>} */
  const results = [];
  const manifest = (await readManifest(appPath)) ?? { updatedAt: null, cores: {} };
  const updatedAt = new Date().toISOString();

  for (const core of EDITOR_CORES) {
    try {
      const result = await updateSingleCore(appPath, core);
      if (core.id === 'rhwp' && result.success) {
        await syncRhwpAdapterVersion(appPath, String(result.version ?? ''));
      }
      results.push(result);
      manifest.cores = manifest.cores ?? {};
      manifest.cores[core.id] = {
        version: result.version,
        updatedAt,
        method: result.method,
      };
    } catch (error) {
      results.push({
        id: core.id,
        label: core.label,
        success: false,
        method: null,
        previousVersion: await readCoreVersion(appPath, core),
        version: await readCoreVersion(appPath, core),
        message: error instanceof Error ? error.message : '업데이트 실패',
      });
    }
  }

  manifest.updatedAt = updatedAt;
  await writeManifest(appPath, manifest);

  const successCount = results.filter((item) => item.success).length;

  return {
    success: successCount === EDITOR_CORES.length,
    partial: successCount > 0 && successCount < EDITOR_CORES.length,
    updatedAt,
    results,
  };
}
