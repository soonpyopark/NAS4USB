import { base64ToBytes, bytesToBase64 } from '../bytes.js';

const MAGIC = new TextEncoder().encode('N4S1');
const VERSION = 1;
const SALT_LEN = 16;
const IV_LEN = 12;
const ITERATIONS = 150_000;
const HEADER_LEN = 4 + 1 + 4 + SALT_LEN + IV_LEN;

/**
 * @param {Uint8Array} bytes
 */
export function looksLikeSecBytes(bytes) {
  return (
    bytes instanceof Uint8Array &&
    bytes.length >= HEADER_LEN + 16 &&
    bytes[0] === MAGIC[0] &&
    bytes[1] === MAGIC[1] &&
    bytes[2] === MAGIC[2] &&
    bytes[3] === MAGIC[3]
  );
}

/**
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {number} iterations
 */
async function deriveKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * @param {Uint8Array} plain
 * @param {string} password
 */
export async function encryptSecBytes(plain, password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(password, salt, ITERATIONS);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain),
  );

  const header = new Uint8Array(HEADER_LEN);
  header.set(MAGIC, 0);
  header[4] = VERSION;
  new DataView(header.buffer).setUint32(5, ITERATIONS);
  header.set(salt, 9);
  header.set(iv, 9 + SALT_LEN);

  const out = new Uint8Array(header.length + cipher.length);
  out.set(header);
  out.set(cipher, header.length);
  return out;
}

/**
 * @param {Uint8Array} packed
 * @param {string} password
 */
export async function decryptSecBytes(packed, password) {
  if (!looksLikeSecBytes(packed)) {
    throw new Error('암호로 보호된 파일이 아닙니다.');
  }
  if (packed[4] !== VERSION) {
    throw new Error('지원하지 않는 암호 파일 형식입니다.');
  }

  const iterations = new DataView(packed.buffer, packed.byteOffset, packed.byteLength).getUint32(5);
  if (!Number.isFinite(iterations) || iterations < 10_000 || iterations > 5_000_000) {
    throw new Error('암호 파일 헤더가 손상되었습니다.');
  }

  const salt = packed.subarray(9, 9 + SALT_LEN);
  const iv = packed.subarray(9 + SALT_LEN, HEADER_LEN);
  const cipher = packed.subarray(HEADER_LEN);
  const key = await deriveKey(password, salt, iterations);

  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher));
  } catch {
    throw new Error('비밀번호가 올바르지 않습니다.');
  }
}

/**
 * @param {string} base64
 * @param {string} password
 */
export async function encryptSecBase64(base64, password) {
  const packed = await encryptSecBytes(base64ToBytes(base64), password);
  return bytesToBase64(packed);
}

/**
 * @param {string} base64
 * @param {string} password
 */
export async function decryptSecBase64(base64, password) {
  const plain = await decryptSecBytes(base64ToBytes(base64), password);
  return bytesToBase64(plain);
}

/**
 * @param {string} base64
 */
export function looksLikeSecBase64(base64) {
  try {
    return looksLikeSecBytes(base64ToBytes(base64));
  } catch {
    return false;
  }
}
