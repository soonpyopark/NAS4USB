import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeWebServerPort } from '../shared/webServerConfig.js';
import { getSyncPort } from './syncServer.js';

const execFileAsync = promisify(execFile);

/**
 * Must match the rule name used by `allow-firewall-inbound.bat` so the two
 * entry points manage the same rule instead of stacking duplicates.
 *
 * @param {number} port
 */
export function firewallRuleName(port) {
  return `NAS4USB LAN (${port})`;
}

/**
 * @param {unknown} port
 */
function resolveTargetPort(port) {
  return normalizeWebServerPort(port) ?? getSyncPort();
}

/**
 * Add a Windows inbound TCP allow rule for the app port.
 * Tries unelevated first, then retries through UAC.
 *
 * @param {unknown} port
 * @returns {Promise<{ ok: boolean, message: string, port: number }>}
 */
export async function allowFirewallInbound(port) {
  const target = resolveTargetPort(port);
  if (process.platform !== 'win32') {
    return { ok: false, message: 'Windows에서만 방화벽 규칙을 추가할 수 있습니다.', port: target };
  }

  const name = firewallRuleName(target);
  const success = {
    ok: true,
    message: `방화벽 인바운드 허용 규칙을 추가했습니다.\nTCP ${target} (${name})`,
    port: target,
  };

  try {
    await runNetshAllow(name, target);
    return success;
  } catch (firstErr) {
    try {
      await runNetshAllowElevated(name, target);
      return success;
    } catch (elevatedErr) {
      return {
        ok: false,
        message: `방화벽 규칙을 추가하지 못했습니다.\n관리자 권한(UAC)을 허용했는지 확인해 주세요.\n${describeError(elevatedErr, firstErr)}`,
        port: target,
      };
    }
  }
}

/**
 * Remove the inbound allow rule for the given (or current) port.
 *
 * @param {unknown} port
 * @returns {Promise<{ ok: boolean, message: string, port: number }>}
 */
export async function removeFirewallInbound(port) {
  const target = resolveTargetPort(port);
  if (process.platform !== 'win32') {
    return { ok: false, message: 'Windows에서만 방화벽 규칙을 제거할 수 있습니다.', port: target };
  }

  const name = firewallRuleName(target);
  const removed = {
    ok: true,
    message: `방화벽 인바운드 허용 규칙을 제거했습니다.\nTCP ${target} (${name})`,
    port: target,
  };

  try {
    await runNetshDelete(name);
    return removed;
  } catch (firstErr) {
    // Missing rule → nothing to do. Access denied → retry elevated.
    if (!isAccessDeniedError(firstErr)) {
      return {
        ok: true,
        message: `방화벽 규칙이 없거나 이미 제거되었습니다.\nTCP ${target} (${name})`,
        port: target,
      };
    }
    try {
      await runNetshDeleteElevated(name);
      return removed;
    } catch (elevatedErr) {
      return {
        ok: false,
        message: `방화벽 규칙을 제거하지 못했습니다.\n관리자 권한(UAC)을 허용했는지 확인해 주세요.\n${describeError(elevatedErr, firstErr)}`,
        port: target,
      };
    }
  }
}

/**
 * @param {string} name
 * @param {number} port
 */
async function runNetshAllow(name, port) {
  await runNetshDelete(name).catch(() => undefined);
  await execFileAsync(
    'netsh',
    [
      'advfirewall',
      'firewall',
      'add',
      'rule',
      `name=${name}`,
      'dir=in',
      'action=allow',
      'protocol=TCP',
      `localport=${port}`,
    ],
    { windowsHide: true },
  );
}

/**
 * @param {string} name
 */
async function runNetshDelete(name) {
  await execFileAsync('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${name}`], {
    windowsHide: true,
  });
}

/**
 * @param {string} name
 * @param {number} port
 */
async function runNetshAllowElevated(name, port) {
  const script =
    `$ErrorActionPreference='Continue'; ` +
    `netsh advfirewall firewall delete rule name="${name}" | Out-Null; ` +
    `$ErrorActionPreference='Stop'; ` +
    `netsh advfirewall firewall add rule name="${name}" dir=in action=allow protocol=TCP localport=${port}; ` +
    `if ($LASTEXITCODE -ne 0) { throw "netsh exit $LASTEXITCODE" }`;
  await runElevatedEncoded(script);
}

/**
 * @param {string} name
 */
async function runNetshDeleteElevated(name) {
  // Always exit 0 — a missing rule is fine; only a cancelled UAC prompt should fail.
  const script =
    `$ErrorActionPreference='Continue'; ` +
    `netsh advfirewall firewall delete rule name="${name}" | Out-Null; ` +
    `exit 0`;
  await runElevatedEncoded(script);
}

/**
 * @param {string} script
 */
async function runElevatedEncoded(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const command =
    `Start-Process -Wait -Verb RunAs -FilePath powershell.exe ` +
    `-ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}')`;

  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { windowsHide: true },
  );
}

/**
 * @param {unknown} err
 */
function collectExecErrorText(err) {
  if (!err || typeof err !== 'object') return String(err);
  const e = /** @type {{ message?: string, stderr?: unknown, stdout?: unknown }} */ (err);
  return [e.message, String(e.stderr ?? ''), String(e.stdout ?? '')].join('\n');
}

/**
 * @param {unknown} elevatedErr
 * @param {unknown} firstErr
 */
function describeError(elevatedErr, firstErr) {
  if (elevatedErr instanceof Error) return elevatedErr.message;
  if (firstErr instanceof Error) return firstErr.message;
  return String(elevatedErr);
}

/**
 * @param {unknown} err
 */
function isAccessDeniedError(err) {
  return /access is denied|요청한 작업에는|상승된 권한|Administrator|권한/i.test(
    collectExecErrorText(err),
  );
}
