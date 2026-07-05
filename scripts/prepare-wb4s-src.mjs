import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncWb4sEngine } from './wb4s-engine.mjs';
import { WB4S_UPSTREAM_VERSION, getWb4sCacheSrc } from './wb4s-upstream.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function main() {
  const method = await syncWb4sEngine(root, { strategy: 'auto' });
  console.log(`[wb4s-src] ready → ${getWb4sCacheSrc(root)} (v${WB4S_UPSTREAM_VERSION}, ${method})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
