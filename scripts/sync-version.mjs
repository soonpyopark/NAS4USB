#!/usr/bin/env node
/**
 * Sync display version into package.json / package-lock / MSI License.rtf.
 * Source of truth: shared/constants.js → APP_VERSION
 *
 * Optional: NAS4USB_BUILD_STAMP=YYMMDD_HHMMSS (or --stamp=…) writes APP_BUILD_STAMP
 * so MSI/portable filename and in-app update check stay aligned.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP_NAME = 'NAS4USB';
const SITE_URL = 'https://note4all.tistory.com';
const CONSTANTS_PATH = path.join(ROOT, 'shared', 'constants.js');

function readVersion() {
  const constants = fs.readFileSync(CONSTANTS_PATH, 'utf8');
  const match = constants.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const version = match?.[1] ?? pkg.version;
  if (!version) throw new Error('Could not resolve app version');
  return version;
}

function formatBuildStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(2);
  return `${yy}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function resolveStampArg() {
  const fromEnv = String(process.env.NAS4USB_BUILD_STAMP || '').trim();
  if (/^\d{6}_\d{6}$/.test(fromEnv)) return fromEnv;
  for (const arg of process.argv.slice(2)) {
    if (arg === '--refresh-stamp') return formatBuildStamp();
    const m = /^--stamp=(.+)$/.exec(arg);
    if (m && /^\d{6}_\d{6}$/.test(m[1].trim())) return m[1].trim();
  }
  return null;
}

/** Keep APP_BUILD_STAMP in sync with MSI/portable package filename suffix. */
function syncBuildStamp(stamp) {
  let text = fs.readFileSync(CONSTANTS_PATH, 'utf8');
  if (/APP_BUILD_STAMP\s*=\s*['"][^'"]*['"]/.test(text)) {
    text = text.replace(/APP_BUILD_STAMP\s*=\s*['"][^'"]*['"]/, `APP_BUILD_STAMP = '${stamp}'`);
  } else {
    text = text.replace(
      /(export const APP_VERSION\s*=\s*['"][^'"]*['"]\s*;?\s*\n)/,
      `$1\n/** Package build id (YYMMDD_HHMMSS). */\nexport const APP_BUILD_STAMP = '${stamp}';\n`,
    );
  }
  if (writeIfChanged(CONSTANTS_PATH, text)) {
    console.log(`[sync-version] APP_BUILD_STAMP -> ${stamp}`);
  }
}

/**
 * electron-builder requires strict semver. Display may use a 4th part (1.1.8.1);
 * map that to 1.1.8-1 for package.json only.
 */
function toNpmVersion(version) {
  const match = String(version)
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match) return version;
  if (match[4] != null) return `${match[1]}.${match[2]}.${match[3]}-${match[4]}`;
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function writeIfChanged(filePath, next) {
  const prev = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (prev === next) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next, 'utf8');
  return true;
}

function syncPackageJson(version) {
  const filePath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const npmVersion = toNpmVersion(version);
  if (pkg.version !== npmVersion) {
    pkg.version = npmVersion;
    fs.writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    console.log(
      npmVersion === version
        ? `[sync-version] package.json -> ${npmVersion}`
        : `[sync-version] package.json -> ${npmVersion} (display ${version})`,
    );
  }

  const lockPath = path.join(ROOT, 'package-lock.json');
  if (!fs.existsSync(lockPath)) return;
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  let changed = false;
  if (lock.version !== npmVersion) {
    lock.version = npmVersion;
    changed = true;
  }
  if (lock.packages?.[''] && lock.packages[''].version !== npmVersion) {
    lock.packages[''].version = npmVersion;
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
    console.log(`[sync-version] package-lock.json -> ${npmVersion}`);
  }
}

/** Escape plain text for RTF (Unicode via \\uN?). */
function toRtfText(text) {
  let out = '';
  for (const ch of text) {
    if (ch === '\\' || ch === '{' || ch === '}') {
      out += `\\${ch}`;
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') {
      out += '\\par\n';
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if (code < 128) {
      out += ch;
    } else if (code <= 0xffff) {
      const signed = code > 32767 ? code - 65536 : code;
      out += `\\u${signed}?`;
    } else {
      const h = Math.floor((code - 0x10000) / 0x400) + 0xd800;
      const l = ((code - 0x10000) % 0x400) + 0xdc00;
      const hs = h > 32767 ? h - 65536 : h;
      const ls = l > 32767 ? l - 65536 : l;
      out += `\\u${hs}?\\u${ls}?`;
    }
  }
  return out;
}

function syncMsiLicenseRtf(version) {
  const filePath = path.join(ROOT, 'msi', 'License.rtf');
  const lines = [
    `${APP_NAME} v${version}`,
    'Offline LAN NAS & real-time collaborative editor',
    'Copyright (C) 2026 Daniel Park',
    'GNU Affero General Public License v3.0 (AGPL-3.0-only)',
    'Full license text: LICENSE in the product / source repository',
    'Third-party notices: THIRD_PARTY_NOTICES.md',
    'https://github.com/soonpyopark/NAS4USB',
    SITE_URL,
  ];
  const rtfBody = toRtfText(lines.join('\n'));
  const body =
    '{\\rtf1\\ansi\\ansicpg65001\\deff0{\\fonttbl{\\f0\\fnil\\fcharset0 Segoe UI;}}\n' +
    '\\viewkind4\\uc1\\pard\\sa200\\sl276\\slmult1\\f0\\fs20 ' +
    rtfBody +
    '\n}\n';

  if (writeIfChanged(filePath, body)) {
    console.log(`[sync-version] msi/License.rtf -> ${APP_NAME} v${version}`);
  }
}

const stamp = resolveStampArg();
if (stamp) syncBuildStamp(stamp);

const version = readVersion();
syncPackageJson(version);
syncMsiLicenseRtf(version);
console.log(
  stamp
    ? `[sync-version] done (${APP_NAME} v${version}, build ${stamp})`
    : `[sync-version] done (${APP_NAME} v${version})`,
);
