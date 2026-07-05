import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DEPARTMENT_CODE } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const usbRoot = path.join(projectRoot, 'usb');
const winUnpacked = path.join(usbRoot, 'win-unpacked');
const portableDir = path.join(usbRoot, 'EduCowork');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyFileIfMissing(from, to) {
  if (await pathExists(to)) return;
  await fs.copyFile(from, to);
}

async function moveFolder(from, to) {
  await fs.rm(to, { recursive: true, force: true });

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      if (err.code !== 'EPERM' && err.code !== 'EBUSY') throw err;
      if (attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  await fs.cp(from, to, { recursive: true });
  await fs.rm(from, { recursive: true, force: true });
}

async function finalizePortableFolder() {
  if (!(await pathExists(winUnpacked))) {
    throw new Error(`빌드 출력을 찾을 수 없습니다: ${winUnpacked}`);
  }

  await moveFolder(winUnpacked, portableDir);

  await fs.mkdir(path.join(portableDir, 'data', DEFAULT_DEPARTMENT_CODE), { recursive: true });
  await copyFileIfMissing(path.join(projectRoot, '.env.example'), path.join(portableDir, '.env.example'));
  await fs.copyFile(
    path.join(projectRoot, 'scripts', 'allow-firewall-inbound.bat'),
    path.join(portableDir, 'allow-firewall-inbound.bat'),
  );

  const readme = `EduCowork USB Portable
======================

1. 이 폴더 전체를 USB 등에 복사합니다.
2. EduCowork.exe 를 실행합니다.
3. LAN 공동 편집 시 .env.example 을 .env 로 복사해 PORT / HOSTNAME 을 설정합니다.
4. Windows 방화벽 허용: allow-firewall-inbound.bat (관리자 실행)

data/ 폴더에 문서가 저장됩니다 (기본값). 다른 경로를 쓰려면 .env 에 DATA_ROOT 를 지정하세요.
예) DATA_ROOT=data  또는  DATA_ROOT=D:/USB/educowork-data

exe 와 같은 폴더를 유지해 주세요.
`;

  await fs.writeFile(path.join(portableDir, 'README-USB.txt'), readme, 'utf8');

  console.log(`\n[build:dist:exe] USB portable folder ready → ${portableDir}`);
}

console.log('[build:dist:exe] Building renderer…');
run('npm', ['run', 'build']);

console.log('[build:dist:exe] Packaging Electron (folder layout, not single exe)…');
run('npx', ['electron-builder', '--win', 'dir']);

await finalizePortableFolder();
