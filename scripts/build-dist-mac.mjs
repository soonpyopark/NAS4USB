import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildRenderer,
  findUnpackedDir,
  moveFolder,
  projectRoot,
  run,
  seedPortableData,
} from './build-dist-common.mjs';

const stagingDir = path.join(projectRoot, '.dist-build', 'mac');
const portableDir = path.join(projectRoot, 'mac');

async function finalizePortableFolder() {
  const macUnpacked = await findUnpackedDir(stagingDir, /^mac/);
  await moveFolder(macUnpacked, portableDir);
  await seedPortableData(portableDir);

  const readme = `NAS4USB USB Portable (macOS)
==============================

1. 이 폴더 전체를 USB 등에 복사합니다.
2. NAS4USB.app 을 실행합니다.
3. LAN 공동 편집 시 .env.example 을 .env 로 복사해 PORT / HOSTNAME 을 설정합니다.

data/ 폴더에 문서가 저장됩니다 (기본값). 다른 경로를 쓰려면 .env 에 DATA_ROOT 를 지정하세요.
예) DATA_ROOT=data

.app 과 같은 폴더를 유지해 주세요.
`;

  await fs.writeFile(path.join(portableDir, 'README-USB.txt'), readme, 'utf8');
  console.log(`\n[build:dist:mac] macOS portable folder ready → ${portableDir}`);
}

if (process.platform !== 'darwin') {
  console.error('[build:dist:mac] macOS 빌드는 macOS에서 실행해야 합니다.');
  process.exit(1);
}

buildRenderer();

const macArch = process.arch === 'arm64' ? 'arm64' : 'x64';
const relativeOutput = path.relative(projectRoot, stagingDir).split(path.sep).join('/');
console.log(`[build:dist:mac] Packaging Electron (mac ${macArch}, dir)…`);
run('npx', ['electron-builder', '--mac', 'dir', `--${macArch}`, `-c.directories.output=${relativeOutput}`]);

await finalizePortableFolder();
