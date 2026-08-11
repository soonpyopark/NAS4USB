import fs from 'node:fs/promises';
import path from 'node:path';
import { seedPortableData, projectRoot } from './build-dist-common.mjs';

const portableDir = path.resolve(projectRoot, process.argv[2] ?? 'exe_new');

await seedPortableData(portableDir);
await fs.writeFile(path.join(portableDir, '.nas4usb-portable'), '1\n', 'utf8');
await fs.copyFile(
  path.join(projectRoot, 'allow-firewall-inbound.bat'),
  path.join(portableDir, 'allow-firewall-inbound.bat'),
);
await fs.copyFile(path.join(projectRoot, 'stop_server.bat'), path.join(portableDir, 'stop_server.bat'));

const icoPath = path.join(projectRoot, 'build', 'icon.ico');
const entries = await fs.readdir(portableDir);
const exeName = entries.find(
  (name) => name.toLowerCase().endsWith('.exe') && !name.toLowerCase().includes('uninstall'),
);

if (exeName) {
  try {
    await fs.access(icoPath);
    const { rcedit } = await import('rcedit');
    await rcedit(path.join(portableDir, exeName), { icon: icoPath });
    console.log(`[finalize] Applied icon → ${exeName}`);
  } catch {
    console.warn('[finalize] icon.ico missing or rcedit failed — skipped');
  }
}

const readme = `NAS4USB USB Portable (Windows)
================================

1. 이 폴더 전체를 USB 등에 복사합니다.
2. NAS4USB.exe 를 실행합니다.
3. LAN 공동 편집 시 .env.example 을 .env 로 복사해 PORT / HOSTNAME 을 설정합니다.
4. Windows 방화벽 허용 (관리자, PowerShell 예):
     cd "이 폴더"
     Start-Process -FilePath ".\\allow-firewall-inbound.bat" -Verb RunAs
5. 서버 중지: stop_server.bat

data/ 폴더에 문서가 저장됩니다 (기본값). 다른 경로를 쓰려면 .env 에 DATA_ROOT 를 지정하세요.
`;

await fs.writeFile(path.join(portableDir, 'README-USB.txt'), readme, 'utf8');
console.log(`[finalize] Portable folder ready → ${portableDir}`);
