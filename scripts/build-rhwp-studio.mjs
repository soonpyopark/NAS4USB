import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const rhwpSrc = path.join(root, '.cache', 'rhwp-src');
const rhwpStudio = path.join(rhwpSrc, 'rhwp-studio');
const rhwpPkg = path.join(rhwpSrc, 'pkg');
const rhwpCore = path.join(root, 'node_modules', '@rhwp', 'core');
const publicOut = path.join(root, 'public', 'rhwp-studio');

function run(cwd, command, args, { shell = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${command} ${args.join(' ')} failed (${code})`));
    });
  });
}

async function ensureRhwpSource() {
  try {
    await fs.access(path.join(rhwpStudio, 'package.json'));
  } catch {
    console.log('[rhwp-studio] cloning edwardkim/rhwp …');
    await fs.mkdir(path.dirname(rhwpSrc), { recursive: true });
    await run(root, 'git', ['clone', '--depth', '1', 'https://github.com/edwardkim/rhwp.git', rhwpSrc]);
  }
}

async function syncWasmPkg() {
  await fs.mkdir(rhwpPkg, { recursive: true });
  for (const name of ['rhwp.js', 'rhwp_bg.wasm', 'rhwp.d.ts', 'rhwp_bg.wasm.d.ts']) {
    await fs.copyFile(path.join(rhwpCore, name), path.join(rhwpPkg, name));
  }
}

async function buildWasmFromSource() {
  const hasCargo = await commandExists('cargo');
  const hasWasmPack = hasCargo && (await commandExists('wasm-pack'));

  if (hasWasmPack) {
    console.log('[rhwp-studio] wasm-pack build …');
    await run(rhwpSrc, 'wasm-pack', ['build', '--target', 'web', '--out-dir', 'pkg']);
  } else {
    console.log('[rhwp-studio] building WASM via Docker …');
    await run(root, 'docker', [
      'run',
      '--rm',
      '-v',
      `${rhwpSrc}:/app`,
      '-w',
      '/app',
      'rust:latest',
      'sh',
      '-c',
      'export PATH=/usr/local/cargo/bin:$PATH && rustup target add wasm32-unknown-unknown && cargo install wasm-pack --version 0.15.0 --locked && wasm-pack build --target web --out-dir pkg',
    ]);
  }

  for (const name of ['rhwp.js', 'rhwp_bg.wasm', 'rhwp.d.ts', 'rhwp_bg.wasm.d.ts']) {
    await fs.copyFile(path.join(rhwpPkg, name), path.join(rhwpCore, name));
  }
  for (const name of ['rhwp.js', 'rhwp_bg.wasm', 'rhwp.d.ts', 'rhwp_bg.wasm.d.ts']) {
    await fs.copyFile(path.join(rhwpPkg, name), path.join(rhwpStudio, 'public', name));
  }
}

function commandExists(command) {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'], {
      shell: true,
      stdio: 'ignore',
    });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

async function wasmArtifactsReady() {
  const required = ['rhwp.js', 'rhwp_bg.wasm'];
  for (const base of [rhwpPkg, rhwpCore]) {
    try {
      for (const name of required) {
        await fs.access(path.join(base, name));
      }
      return true;
    } catch {
      // try next location
    }
  }
  return false;
}

async function copyWasmToStudioPublic() {
  for (const name of ['rhwp.js', 'rhwp_bg.wasm', 'rhwp.d.ts', 'rhwp_bg.wasm.d.ts']) {
    const fromPkg = path.join(rhwpPkg, name);
    const fromCore = path.join(rhwpCore, name);
    const source = await fs.access(fromPkg).then(() => fromPkg).catch(() => fromCore);
    await fs.mkdir(path.join(rhwpStudio, 'public'), { recursive: true });
    await fs.copyFile(source, path.join(rhwpStudio, 'public', name));
  }
}

async function ensureWasmPkg() {
  if (await wasmArtifactsReady()) {
    console.log('[rhwp-studio] WASM pkg already present — skipping rebuild');
    try {
      await syncWasmPkg();
    } catch {
      // pkg may already be complete when core is absent
    }
    await copyWasmToStudioPublic();
    return;
  }

  await buildWasmFromSource();
}

async function buildStudio() {
  console.log('[rhwp-studio] npm install …');
  await run(rhwpStudio, 'npm', ['install'], { shell: process.platform === 'win32' });
  console.log('[rhwp-studio] vite build (offline bundle) …');
  await run(rhwpStudio, 'npx', ['vite', 'build', '--base=./'], { shell: process.platform === 'win32' });
}

async function stripEmbedBlockers(outDir) {
  const indexPath = path.join(outDir, 'index.html');
  let html = await fs.readFile(indexPath, 'utf8');
  html = html
    .replace(/<script id="vite-plugin-pwa:register-sw"[^>]*><\/script>/g, '')
    .replace(/<link rel="manifest" href="[^"]*">/g, '')
    .replace(
      '<script src="./theme-init.js"></script>',
      '<script src="./theme-init.js"></script>\n  <script src="./embed-init.js"></script>',
    );
  await fs.writeFile(indexPath, html, 'utf8');
  await fs.copyFile(path.join(root, 'scripts', 'rhwp-embed-init.js'), path.join(outDir, 'embed-init.js'));
  for (const name of ['registerSW.js', 'sw.js', 'workbox-dcde9eb3.js', 'manifest.webmanifest']) {
    await fs.rm(path.join(outDir, name), { force: true });
  }
}

/**
 * 셀 안 표 만들기 버그 우회: 스튜디오 UI가 cellPath를 JSON 문자열로 넘겨
 * WASM(`createTableInCellEx`)이 "cellPath JSON은 배열이어야 합니다" 오류를 던진다.
 * 래퍼에서 cellPath가 문자열이면 배열로 정규화한다.
 */
async function patchNestedTableCellPath(outDir) {
  const assetsDir = path.join(outDir, 'assets');
  let files = [];
  try {
    files = (await fs.readdir(assetsDir)).filter((name) => name.endsWith('.js'));
  } catch {
    return;
  }

  const marker =
    'createTableInCellEx(e){if(!this.doc)throw Error(`문서가 로드되지 않았습니다`);return JSON.parse(this.doc.createTableInCellEx(JSON.stringify(e)))}';
  const patched =
    'createTableInCellEx(e){if(!this.doc)throw Error(`문서가 로드되지 않았습니다`);if(e&&typeof e.cellPath==="string"){try{e={...e,cellPath:JSON.parse(e.cellPath)}}catch{}}if(e&&Array.isArray(e.cellPath)&&e.cellPath.length){let _l=e.cellPath[e.cellPath.length-1]||{};e={...e,controlIdx:e.controlIdx??_l.controlIndex??_l.controlIdx,cellIdx:e.cellIdx??_l.cellIndex??_l.cellIdx,cellParaIdx:e.cellParaIdx??_l.cellParaIndex??_l.cellParaIdx}}return JSON.parse(this.doc.createTableInCellEx(JSON.stringify(e)))}';

  for (const name of files) {
    const filePath = path.join(assetsDir, name);
    const source = await fs.readFile(filePath, 'utf8');
    if (!source.includes(marker)) continue;
    await fs.writeFile(filePath, source.replaceAll(marker, patched), 'utf8');
    console.log(`[rhwp-studio] patched nested-table cellPath → assets/${name}`);
    return;
  }
  console.warn('[rhwp-studio] nested-table cellPath marker not found — skipped (upstream may have fixed it)');
}

/**
 * PC에 설치된 로컬 글꼴을 편집기에서 원본 이름 그대로 쓸 수 있게 등록한다.
 * - 번들의 등록 글꼴 집합 `P`에 이름을 추가하면 대체 테이블(`Ze`)을 우회해
 *   글꼴 스택 맨 앞에 원본명이 놓이고, 설치돼 있으면 시스템 글꼴로 렌더된다.
 *   미설치 시에는 `rt()`의 명조/고딕 폴백으로 자연스럽게 대체된다.
 * - 글꼴 드롭다운(index.html)에도 선택 항목을 추가한다.
 * @see public/rhwp-studio/assets/index-*.js (`at`/`it`/`rt` 글꼴 스택 빌더)
 */
const PC_LOCAL_FONTS = ['휴먼명조', '휴먼고딕'];

async function patchPcLocalFonts(outDir) {
  const assetsDir = path.join(outDir, 'assets');
  const marker = 'P=new Set(N.map(e=>e.name))';
  const replacement = `P=new Set([...N.map(e=>e.name),${PC_LOCAL_FONTS.map((n) => `\`${n}\``).join(',')}])`;

  let files = [];
  try {
    files = (await fs.readdir(assetsDir)).filter((name) => name.endsWith('.js'));
  } catch {
    files = [];
  }
  let bundlePatched = false;
  for (const name of files) {
    const filePath = path.join(assetsDir, name);
    const source = await fs.readFile(filePath, 'utf8');
    if (!source.includes(marker)) continue;
    await fs.writeFile(filePath, source.replaceAll(marker, replacement), 'utf8');
    console.log(`[rhwp-studio] registered PC fonts (${PC_LOCAL_FONTS.join(', ')}) → assets/${name}`);
    bundlePatched = true;
    break;
  }
  if (!bundlePatched) {
    console.warn('[rhwp-studio] font-registry marker not found — skipped (upstream may have changed)');
  }

  const indexPath = path.join(outDir, 'index.html');
  let html = await fs.readFile(indexPath, 'utf8');
  const anchor = '<option value="궁서">궁서</option>';
  const options = PC_LOCAL_FONTS.map((n) => `<option value="${n}">${n}</option>`);
  const missing = options.filter((opt) => !html.includes(opt));
  if (html.includes(anchor) && missing.length) {
    html = html.replace(anchor, `${anchor}\n        ${missing.join('\n        ')}`);
    await fs.writeFile(indexPath, html, 'utf8');
    console.log(`[rhwp-studio] added PC font options → index.html`);
  }
}

async function publishDist() {
  const distDir = path.join(rhwpStudio, 'dist');
  await fs.rm(publicOut, { recursive: true, force: true });
  await fs.cp(distDir, publicOut, { recursive: true });
  await stripEmbedBlockers(publicOut);
  await patchNestedTableCellPath(publicOut);
  await patchPcLocalFonts(publicOut);
  console.log(`[rhwp-studio] published → ${publicOut}`);
}

await ensureRhwpSource();
await ensureWasmPkg();
await buildStudio();
await publishDist();
