import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildRenderer,
  findUnpackedDir,
  moveFolder,
  packagePlatform,
  pathExists,
  projectRoot,
  seedPortableData,
} from './build-dist-common.mjs';

const stagingDir = path.join(projectRoot, '.dist-build', 'win');
const portableDir = path.join(projectRoot, 'exe');

async function applyPortableExeIcon(portableDirPath) {
  const icoPath = path.join(projectRoot, 'build', 'icon.ico');
  if (!(await pathExists(icoPath))) {
    console.warn('[build:dist:exe] build/icon.ico not found — skipping exe icon');
    return;
  }

  const entries = await fs.readdir(portableDirPath);
  const exeName = entries.find(
    (name) => name.toLowerCase().endsWith('.exe') && !name.toLowerCase().includes('uninstall'),
  );
  if (!exeName) {
    console.warn('[build:dist:exe] main exe not found — skipping exe icon');
    return;
  }

  const { rcedit } = await import('rcedit');
  const exePath = path.join(portableDirPath, exeName);
  await rcedit(exePath, { icon: icoPath });
  console.log(`[build:dist:exe] Applied NAS4USB icon → ${exeName}`);
}

async function finalizePortableFolder() {
  const winUnpacked = await findUnpackedDir(stagingDir, /^win-/);
  await moveFolder(winUnpacked, portableDir);
  await seedPortableData(portableDir);

  await fs.copyFile(
    path.join(projectRoot, 'scripts', 'allow-firewall-inbound.bat'),
    path.join(portableDir, 'allow-firewall-inbound.bat'),
  );

  await applyPortableExeIcon(portableDir);

  const readme = `NAS4USB USB Portable (Windows)
================================

1. 이 폴더 전체를 USB 등에 복사합니다.
2. NAS4USB.exe 를 실행합니다.
3. LAN 공동 편집 시 .env.example 을 .env 로 복사해 PORT / HOSTNAME 을 설정합니다.
4. Windows 방화벽 허용: allow-firewall-inbound.bat (관리자 실행)

data/ 폴더에 문서가 저장됩니다 (기본값). 다른 경로를 쓰려면 .env 에 DATA_ROOT 를 지정하세요.
예) DATA_ROOT=data  또는  DATA_ROOT=D:/USB/educowork-data

exe 와 같은 폴더를 유지해 주세요.
`;

  await fs.writeFile(path.join(portableDir, 'README-USB.txt'), readme, 'utf8');
  console.log(`\n[build:dist:exe] Windows portable folder ready → ${portableDir}`);
}

if (process.platform !== 'win32') {
  console.warn('[build:dist:exe] Windows 빌드는 Windows에서 실행하는 것을 권장합니다.');
}

buildRenderer();
packagePlatform('--win', stagingDir);
await finalizePortableFolder();
