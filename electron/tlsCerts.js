import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';
import { createRequire } from 'node:module';
import { getPortableRoot, getWorkspaceRoot } from './appContext.js';
import { getLocalIPv4Addresses } from './lanAddresses.js';

const require = createRequire(import.meta.url);
const forge = require('node-forge');

const TLS_DIR = path.join('.nas4usb', 'tls');
const CA_CERT_NAME = 'ca.crt';
const CA_KEY_NAME = 'ca.key';
const SERVER_CERT_NAME = 'server.crt';
const SERVER_KEY_NAME = 'server.key';
const META_NAME = 'meta.json';

const CA_YEARS = 10;
const SERVER_DAYS = 825;

/**
 * Data-root (workspace) folder the user set in 설정. Same parent as share/private.
 *
 * @param {string} [root]
 */
export function getTlsRoot(root) {
  if (root) return root;
  try {
    return getWorkspaceRoot();
  } catch {
    return getPortableRoot();
  }
}

/**
 * @param {string} [root]
 */
export function getTlsDir(root) {
  return path.join(getTlsRoot(root), TLS_DIR);
}

/**
 * Previous location: `{프로그램폴더}/.nas4usb/tls`
 *
 * @param {string} [root]
 */
function getLegacyTlsDir(root) {
  try {
    const portable = getPortableRoot();
    const current = getTlsRoot(root);
    if (path.resolve(portable) !== path.resolve(current)) {
      return path.join(portable, TLS_DIR);
    }
  } catch {
    // ignore
  }
  return '';
}

/**
 * @param {string} [root]
 */
export function getCaCertificatePath(root) {
  return path.join(getTlsDir(root), CA_CERT_NAME);
}

function filePaths(root) {
  const dir = getTlsDir(root);
  return {
    dir,
    caCert: path.join(dir, CA_CERT_NAME),
    caKey: path.join(dir, CA_KEY_NAME),
    serverCert: path.join(dir, SERVER_CERT_NAME),
    serverKey: path.join(dir, SERVER_KEY_NAME),
    meta: path.join(dir, META_NAME),
  };
}

/**
 * @param {string} [root]
 */
async function migrateLegacyTlsDir(root) {
  const files = filePaths(root);
  if (existsSync(files.caCert) && existsSync(files.caKey)) return;
  const legacyDir = getLegacyTlsDir(root);
  if (!legacyDir || !existsSync(path.join(legacyDir, CA_CERT_NAME))) return;
  await fs.mkdir(files.dir, { recursive: true });
  for (const name of [CA_CERT_NAME, CA_KEY_NAME, SERVER_CERT_NAME, SERVER_KEY_NAME, META_NAME]) {
    const from = path.join(legacyDir, name);
    const to = path.join(files.dir, name);
    if (existsSync(from) && !existsSync(to)) {
      await fs.copyFile(from, to);
    }
  }
}

function randomSerial() {
  return forge.util.bytesToHex(forge.random.getBytesSync(16));
}

function generateKeyPair() {
  return forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
}

/**
 * @returns {string[]}
 */
export function desiredTlsSans() {
  const sans = new Set(['localhost', '127.0.0.1']);
  for (const address of getLocalIPv4Addresses()) {
    if (address) sans.add(address);
  }
  return [...sans];
}

/**
 * @param {string} value
 */
function isIpv4(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

/**
 * @param {string[]} needed
 * @param {string[] | undefined} have
 */
function sansCover(needed, have) {
  if (!Array.isArray(have) || have.length === 0) return false;
  const set = new Set(have.map((item) => String(item).toLowerCase()));
  return needed.every((item) => set.has(String(item).toLowerCase()));
}

function createCaCertificate() {
  const keys = generateKeyPair();
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = randomSerial();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + CA_YEARS);
  const attrs = [
    { name: 'commonName', value: 'NAS4USB Local CA' },
    { name: 'organizationName', value: 'NAS4USB' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true, pathLenConstraint: 0, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

/**
 * @param {string} caCertPem
 * @param {string} caKeyPem
 * @param {string[]} sans
 */
function createServerCertificate(caCertPem, caKeyPem, sans) {
  const caCert = forge.pki.certificateFromPem(caCertPem);
  const caKey = forge.pki.privateKeyFromPem(caKeyPem);
  const keys = generateKeyPair();
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = randomSerial();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + SERVER_DAYS);
  cert.setSubject([
    { name: 'commonName', value: 'NAS4USB' },
    { name: 'organizationName', value: 'NAS4USB' },
  ]);
  cert.setIssuer(caCert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    {
      name: 'subjectAltName',
      altNames: sans.map((value) =>
        isIpv4(value) ? { type: 7, ip: value } : { type: 2, value },
      ),
    },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: true },
  ]);
  cert.sign(caKey, forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
    notAfter: cert.validity.notAfter.toISOString(),
  };
}

/**
 * @param {string} [root]
 */
async function ensureCa(root) {
  const files = filePaths(root);
  await fs.mkdir(files.dir, { recursive: true });
  if (existsSync(files.caCert) && existsSync(files.caKey)) {
    return {
      certPem: await fs.readFile(files.caCert, 'utf8'),
      keyPem: await fs.readFile(files.caKey, 'utf8'),
    };
  }
  const created = createCaCertificate();
  await fs.writeFile(files.caCert, created.certPem, 'utf8');
  await fs.writeFile(files.caKey, created.keyPem, 'utf8');
  return created;
}

/**
 * @param {string} [root]
 */
function readMeta(root) {
  const files = filePaths(root);
  try {
    return JSON.parse(readFileSync(files.meta, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Ensure a local CA and a server cert covering localhost + current LAN IPs.
 *
 * @param {{ forceServer?: boolean, portableRoot?: string, root?: string }} [options]
 */
export async function ensureTlsMaterial(options = {}) {
  const root = options.root ?? options.portableRoot;
  await migrateLegacyTlsDir(root);
  const files = filePaths(root);
  const ca = await ensureCa(root);
  const sans = desiredTlsSans();
  const meta = readMeta(root);
  const haveServer = existsSync(files.serverCert) && existsSync(files.serverKey);
  const needsNewServer = Boolean(options.forceServer) || !haveServer || !sansCover(sans, meta?.sans);

  if (needsNewServer) {
    const server = createServerCertificate(ca.certPem, ca.keyPem, sans);
    await fs.writeFile(files.serverCert, server.certPem, 'utf8');
    await fs.writeFile(files.serverKey, server.keyPem, 'utf8');
    await fs.writeFile(
      files.meta,
      `${JSON.stringify({ sans, notAfter: server.notAfter, generatedAt: new Date().toISOString() }, null, 2)}\n`,
      'utf8',
    );
  }

  const cert = await fs.readFile(files.serverCert, 'utf8');
  const key = await fs.readFile(files.serverKey, 'utf8');
  return {
    key,
    cert,
    ca: ca.certPem,
    sans: readMeta(root)?.sans ?? sans,
  };
}

/**
 * @param {string} [root]
 */
export function readServerCertificatePem(root) {
  const files = filePaths(root);
  try {
    return readFileSync(files.serverCert, 'utf8');
  } catch {
    return '';
  }
}

/**
 * @param {string} fingerprint256
 * @param {string} [root]
 */
export function isTrustedServerFingerprint(fingerprint256, root) {
  const pem = readServerCertificatePem(root);
  if (!pem || !fingerprint256) return false;
  try {
    const ours = new X509Certificate(pem).fingerprint256.replace(/:/g, '').toLowerCase();
    const theirs = String(fingerprint256).replace(/:/g, '').toLowerCase();
    return ours.length > 0 && ours === theirs;
  } catch {
    return false;
  }
}

/**
 * Electron's Certificate struct often has SHA-1 `fingerprint` and PEM `data`,
 * not `fingerprint256`. Compare all of those against our server cert.
 * @param {{ fingerprint?: string, fingerprint256?: string, data?: string } | null | undefined} certificate
 * @param {string} [root]
 */
export function isTrustedElectronCertificate(certificate, root) {
  const pem = readServerCertificatePem(root);
  if (!pem || !certificate) return false;
  try {
    const ours = new X509Certificate(pem);
    const ours256 = ours.fingerprint256.replace(/:/g, '').toLowerCase();
    const ours1 = ours.fingerprint.replace(/:/g, '').toLowerCase();
    const claimed256 = String(certificate.fingerprint256 ?? '').replace(/:/g, '').toLowerCase();
    if (claimed256 && claimed256 === ours256) return true;
    const claimed1 = String(certificate.fingerprint ?? '').replace(/:/g, '').toLowerCase();
    if (claimed1 && claimed1 === ours1) return true;
    const data = String(certificate.data ?? '').trim();
    if (!data) return false;
    const wrapped = data.includes('BEGIN CERTIFICATE')
      ? data
      : `-----BEGIN CERTIFICATE-----\n${data}\n-----END CERTIFICATE-----`;
    const theirs = new X509Certificate(wrapped);
    return ours256 === theirs.fingerprint256.replace(/:/g, '').toLowerCase();
  } catch {
    return false;
  }
}

/**
 * @param {string} [root]
 */
export async function getTlsStatus(root) {
  await migrateLegacyTlsDir(root);
  const files = filePaths(root);
  const meta = readMeta(root);
  let fingerprint256 = '';
  let notAfter = typeof meta?.notAfter === 'string' ? meta.notAfter : '';
  if (existsSync(files.serverCert)) {
    try {
      const x509 = new X509Certificate(readFileSync(files.serverCert));
      fingerprint256 = x509.fingerprint256;
      notAfter = x509.validTo;
    } catch {
      // ignore
    }
  }
  return {
    dir: files.dir,
    caPath: files.caCert,
    hasCa: existsSync(files.caCert) && existsSync(files.caKey),
    hasServer: existsSync(files.serverCert) && existsSync(files.serverKey),
    sans: Array.isArray(meta?.sans) ? meta.sans : [],
    notAfter,
    fingerprint256,
  };
}

/**
 * @param {boolean} httpsEnabled
 * @param {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void} [requestListener]
 */
export async function createAppHttpServer(httpsEnabled, requestListener) {
  if (!httpsEnabled) {
    return requestListener ? http.createServer(requestListener) : http.createServer();
  }
  const tls = await ensureTlsMaterial();
  const options = {
    key: tls.key,
    cert: `${tls.cert.trim()}\n${tls.ca.trim()}\n`,
    ca: tls.ca,
  };
  return requestListener
    ? https.createServer(options, requestListener)
    : https.createServer(options);
}
