import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWb4sEditorBundle, syncWb4sEngine } from './wb4s-engine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function main() {
  await syncWb4sEngine(root, { strategy: 'auto' });
  await buildWb4sEditorBundle(root);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
