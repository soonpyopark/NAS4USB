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
 * @param {string} appPath
 * @param {import('../shared/editorCores.js').EditorCoreDefinition} core
 */
async function readCoreVersion(appPath, core) {
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
async function updateSingleCore(appPath, core) {
  /** @type {string|null} */
  let method = null;

  if ((await isGitRepository(appPath)) && (await pathExists(appPath, '.gitmodules'))) {
    try {
      method = await updateCoreViaGit(appPath, core);
    } catch (gitError) {
      if (!(await pathExists(appPath, core.updatePackageDir))) {
        throw gitError;
      }
      method = await updateCoreViaLocalPackage(appPath, core);
    }
  } else if (await pathExists(appPath, core.updatePackageDir)) {
    method = await updateCoreViaLocalPackage(appPath, core);
  } else {
    throw new Error('Git submodule 또는 lib/updates 패키지가 필요합니다.');
  }

  const version = await readCoreVersion(appPath, core);
  return {
    id: core.id,
    label: core.label,
    success: true,
    method,
    version,
    message: `${core.label} v${version} 반영 완료`,
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
