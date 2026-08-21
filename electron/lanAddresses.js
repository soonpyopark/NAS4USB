import os from 'node:os';

export function getLocalIPv4Addresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }

  // Link-local (APIPA) is only valid on one cable. Keep it last so share/LAN URLs
  // prefer a real LAN or public-facing address.
  return addresses.sort(
    (left, right) => Number(left.startsWith('169.254.')) - Number(right.startsWith('169.254.')),
  );
}
