import { createRequire } from 'node:module';
import { toRoomId } from '../shared/roomId.js';

const require = createRequire(import.meta.url);
const { docs } = require('y-websocket/bin/utils');

/**
 * @param {string} roomId
 */
export function purgeYjsRoom(roomId) {
  if (!roomId) return false;

  const doc = docs.get(roomId);
  if (!doc) return false;

  for (const conn of doc.conns.keys()) {
    try {
      conn.close();
    } catch {
      // ignore broken sockets
    }
  }

  doc.destroy();
  docs.delete(roomId);
  return true;
}

/**
 * @param {string} relativePath
 */
export function purgeYjsRoomForPath(relativePath) {
  return purgeYjsRoom(toRoomId(relativePath));
}
