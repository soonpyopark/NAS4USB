import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CORES_MANIFEST_PATH, EDITOR_CORES } from '../shared/editorCores.js';

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
  const npmPackages = getNpmPackages(core);
  if (npmPackages.length > 0) {
    const versions = [];
    for (const packageName of npmPackages) {
      const version = await readNpmPackageVersion(appPath, packageName);
      if (version !== 'not-installed') {
        versions.push(`${packageName}@${version}`);
      }
    }
    if (versions.length > 0) {
      return versions.join(', ');
    }
  }

  const packagePath = path.join(appPath, core.libDir, 'package.json');
  try {
    const raw = await fs.readFile(packagePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.version ?? parsed.name ?? 'unknown';
  } catch {
    return 'not-installed';
  }
}

/**
 * @param {string} appPath
 */
export async function getEditorCoresStatus(appPath) {
  const manifest = await readManifest(appPath);
  const cores = {};

  for (const core of EDITOR_CORES) {
    const version = await readCoreVersion(appPath, core);
    const hasGit = (await isGitRepository(appPath)) && (await hasSubmoduleCheckout(appPath, core.submodulePath));
    const hasLocalPackage = await pathExists(appPath, core.updatePackageDir);

    cores[core.id] = {
      id: core.id,
      label: core.label,
      version,
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
    return { updatedAt: null, cores: {} };
  }
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
  if (core.id === 'wb4s') {
    return updateWb4sCore(appPath, core);
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
        version,
        message: `${core.label} ${version} 반영 완료`,
      };
    } catch (error) {
      if (error instanceof Error) {
        npmErrors.push(error);
      }
      if (core.id === 'fortune-sheet') {
        throw npmErrors[0] ?? new Error('Fortune Sheet npm 업데이트 실패');
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
    version,
    message: `${core.label} ${version} 반영 완료`,
  };
}

/**
 * @param {string} appPath
 */
export async function updateEditorCores(appPath) {
  /** @type {Array<Record<string, unknown>>} */
  const results = [];
  const manifest = await readManifest(appPath);
  const updatedAt = new Date().toISOString();

  for (const core of EDITOR_CORES) {
    try {
      const result = await updateSingleCore(appPath, core);
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
