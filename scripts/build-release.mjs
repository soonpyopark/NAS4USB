#!/usr/bin/env node
/**
 * Build MSI + portable zip from one Electron unpack, one APP_BUILD_STAMP.
 *
 * Output (same YYMMDD_HHMMSS):
 *   msi/NAS4USB v{version}_{stamp}.msi
 *   msi/NAS4USB v{version}_{stamp}_portable.zip
 *   exe/NAS4USB_{version}_{stamp}/ (+ sibling .zip)
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import {
  RELEASE_STAGING_DIR,
  buildRenderer,
  formatBuildTimestamp,
  packagePlatform,
  projectRoot,
  syncBuildStamp,
} from './build-dist-common.mjs';

function log(msg) {
  console.log(`[release] ${msg}`);
}

function run(cmd, options = {}) {
  log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: projectRoot, shell: true, ...options });
}

function main() {
  if (process.platform !== 'win32') {
    throw new Error('build:release must run on Windows.');
  }

  const stamp = formatBuildTimestamp();
  log(`build stamp: ${stamp}`);

  syncBuildStamp(stamp);

  run('npm run prepare:icons');
  fs.rmSync(RELEASE_STAGING_DIR, { recursive: true, force: true });
  buildRenderer();
  packagePlatform('--win', RELEASE_STAGING_DIR);

  const env = {
    ...process.env,
    NAS4USB_BUILD_STAMP: stamp,
    NAS4USB_SKIP_STAMP: '1',
    NAS4USB_SKIP_PUBLISH: '1',
    NAS4USB_RELEASE_PORTABLE: '1',
  };

  run('node scripts/build-msi.mjs', { env });
  run('node scripts/build-dist-exe.mjs', { env });

  log(`done — MSI + portable share stamp ${stamp}`);
  log(`artifacts under msi/ and exe/ (see NAS4USB v*_${stamp}*)`);
}

try {
  main();
} catch (error) {
  console.error('[release] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
