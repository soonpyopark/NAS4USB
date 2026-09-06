import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getPortableRoot } from './appContext.js';
import { normalizeClientIp } from './ipAllowlist.js';
import { getAppSettings } from './settingsService.js';

const AUDIT_FILE = '.nas4usb-login-audit.json';
const MAX_ENTRIES = 1000;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/** @typedef {'success' | 'fail' | 'locked'} LoginAuditResult */

/**
 * @typedef {{
 *   id: string,
 *   at: string,
 *   loginId: string,
 *   result: LoginAuditResult,
 *   ip: string,
 * }} LoginAuditEntry
 */

/** @type {Promise<void>} */
let writeChain = Promise.resolve();

/**
 * @param {string} [portableRoot]
 */
function auditFilePath(portableRoot = getPortableRoot()) {
  return path.join(portableRoot, AUDIT_FILE);
}

/**
 * @param {unknown} value
 * @returns {LoginAuditResult | null}
 */
function normalizeResult(value) {
  return value === 'success' || value === 'fail' || value === 'locked' ? value : null;
}

/**
 * @param {unknown} raw
 * @returns {LoginAuditEntry | null}
 */
function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const loginId = String(raw.loginId ?? '').trim();
  const result = normalizeResult(raw.result);
  const at = String(raw.at ?? '').trim();
  if (!loginId || !result || !at) return null;
  const parsed = Date.parse(at);
  if (!Number.isFinite(parsed)) return null;
  const ip = normalizeClientIp(String(raw.ip ?? '')) || String(raw.ip ?? '').trim() || '—';
  return {
    id: String(raw.id ?? '').trim() || crypto.randomUUID(),
    at: new Date(parsed).toISOString(),
    loginId,
    result,
    ip,
  };
}

/**
 * @param {LoginAuditEntry[]} entries
 */
function pruneEntries(entries) {
  const cutoff = Date.now() - MAX_AGE_MS;
  return entries
    .filter((entry) => Date.parse(entry.at) >= cutoff)
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, MAX_ENTRIES);
}

/**
 * @param {string} [portableRoot]
 * @returns {Promise<LoginAuditEntry[]>}
 */
async function loadEntries(portableRoot) {
  try {
    const raw = await fs.readFile(auditFilePath(portableRoot), 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.entries) ? parsed.entries : [];
    return pruneEntries(list.map(normalizeEntry).filter(Boolean));
  } catch {
    return [];
  }
}

/**
 * @param {string} [portableRoot]
 * @param {LoginAuditEntry[]} entries
 */
async function saveEntries(portableRoot, entries) {
  const filePath = auditFilePath(portableRoot);
  const payload = `${JSON.stringify({ version: 1, entries }, null, 2)}\n`;
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, payload, 'utf8');
  await fs.rename(tmp, filePath);
}

/**
 * @param {{
 *   loginId: string,
 *   result: LoginAuditResult,
 *   clientIp?: string,
 * }} entry
 * @param {string} [portableRoot]
 */
export function recordLoginAudit(entry, portableRoot) {
  writeChain = writeChain
    .then(async () => {
      const root = portableRoot ?? getPortableRoot();
      try {
        const settings = await getAppSettings(root);
        if (settings.loginAuditEnabled === false) return;
      } catch {
        return;
      }
      const loginId = String(entry?.loginId ?? '').trim();
      const result = normalizeResult(entry?.result);
      if (!loginId || !result) return;
      const next = pruneEntries([
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          loginId,
          result,
          ip: normalizeClientIp(String(entry.clientIp ?? '')) || '—',
        },
        ...(await loadEntries(root)),
      ]);
      await saveEntries(root, next);
    })
    .catch((err) => {
      console.warn('[auth] login audit write failed:', err);
    });
  return writeChain;
}

/**
 * @param {{ loginId?: string, result?: string }} [filter]
 * @param {string} [portableRoot]
 * @returns {Promise<{ entries: LoginAuditEntry[], lastSuccessAt: Record<string, string> }>}
 */
export async function listLoginAudit(filter = {}, portableRoot) {
  const entries = await loadEntries(portableRoot);
  const loginFilter = String(filter.loginId ?? '').trim().toLowerCase();
  const resultFilter = normalizeResult(filter.result);
  const filtered = entries.filter((entry) => {
    if (loginFilter && !entry.loginId.toLowerCase().includes(loginFilter)) return false;
    if (resultFilter && entry.result !== resultFilter) return false;
    return true;
  });
  /** @type {Record<string, string>} */
  const lastSuccessAt = {};
  for (const entry of entries) {
    if (entry.result !== 'success') continue;
    const key = entry.loginId.toLowerCase();
    if (!lastSuccessAt[key]) lastSuccessAt[key] = entry.at;
  }
  return { entries: filtered, lastSuccessAt };
}
