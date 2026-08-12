import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getExeRoot, getInstallRoot, getTempPath } from './appContext.js';
import { sanitizeTiptapHtmlForHwpx } from './hwpxHtmlSanitize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

/**
 * @returns {string}
 */
export function resolveHwpxExportRoot() {
  const candidates = [
    path.join(getExeRoot(), 'tools', 'hwpx-export'),
    path.join(getInstallRoot(), 'tools', 'hwpx-export'),
    path.join(projectRoot, 'tools', 'hwpx-export'),
  ];
  return candidates[0];
}

/**
 * @returns {Promise<string>}
 */
async function resolveExistingExportRoot() {
  const candidates = [
    path.join(getExeRoot(), 'tools', 'hwpx-export'),
    path.join(getInstallRoot(), 'tools', 'hwpx-export'),
    path.join(projectRoot, 'tools', 'hwpx-export'),
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(path.join(candidate, 'run_convert.py'));
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error(
    'HWPX 변환 도구가 없습니다. 호스트에서 `npm run prepare:hwpx-export`를 실행하세요.',
  );
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function runProcess(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (err) => {
      resolve({
        code: 1,
        stdout,
        stderr: `${stderr}\n${err instanceof Error ? err.message : String(err)}`.trim(),
      });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * @param {string} html
 * @param {{ fileName: string, base64: string }[]} assets
 * @param {string} workDir
 * @returns {Promise<string>} absolute path of written HTML
 */
async function materializeHtmlDocument(html, assets, workDir) {
  const mediaDir = path.join(workDir, 'media');
  await fs.mkdir(mediaDir, { recursive: true });

  /** @type {Map<string, string>} */
  const fileNameToRel = new Map();
  for (const asset of assets) {
    const safeName = path.basename(String(asset.fileName || '')).replace(/[^\w.\-()+]/g, '_');
    if (!safeName || !asset.base64) continue;
    const abs = path.join(mediaDir, safeName);
    await fs.writeFile(abs, Buffer.from(asset.base64, 'base64'));
    fileNameToRel.set(safeName, `media/${safeName}`);
    fileNameToRel.set(`assets/${safeName}`, `media/${safeName}`);
  }

  let body = sanitizeTiptapHtmlForHwpx(html);

  // Rewrite TipTap package asset URLs and common absolute/stream forms to local media/*.
  body = body.replace(
    /(?:src|href)=["']([^"']+)["']/gi,
    (full, url) => {
      const raw = String(url);
      const decoded = (() => {
        try {
          return decodeURIComponent(raw);
        } catch {
          return raw;
        }
      })();

      for (const [key, rel] of fileNameToRel) {
        if (decoded === key || decoded.endsWith(`/${key}`) || decoded.includes(`assets/${path.basename(key)}`)) {
          const attr = full.startsWith('href') ? 'href' : 'src';
          return `${attr}="${rel}"`;
        }
      }

      const assetMatch = decoded.match(/(?:^|\/)assets\/([^/?#]+)/i);
      if (assetMatch) {
        const name = assetMatch[1];
        const rel = fileNameToRel.get(name) || fileNameToRel.get(`assets/${name}`);
        if (rel) {
          const attr = full.startsWith('href') ? 'href' : 'src';
          return `${attr}="${rel}"`;
        }
      }
      return full;
    },
  );

  const documentHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>export</title>
</head>
<body>
${body}
</body>
</html>
`;

  const htmlPath = path.join(workDir, 'document.html');
  await fs.writeFile(htmlPath, documentHtml, 'utf8');
  return htmlPath;
}

/**
 * Convert TipTap HTML (+ optional embedded assets) to HWPX bytes (base64).
 *
 * @param {{
 *   html: string,
 *   fileName?: string,
 *   assets?: { fileName: string, base64: string }[],
 * }} input
 * @returns {Promise<{ base64: string, fileName: string }>}
 */
export async function convertHtmlToHwpxBase64(input) {
  const exportRoot = await resolveExistingExportRoot();
  const runner = path.join(exportRoot, 'run_convert.py');
  const reference = path.join(exportRoot, 'vendor', 'pypandoc_hwpx', 'blank.hwpx');
  await fs.access(runner);
  await fs.access(reference);

  const stem = String(input.fileName || 'document')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w.\-()\uac00-\ud7a3 ]+/g, '_')
    .trim() || 'document';
  const outName = `${stem}.hwpx`;

  const workDir = await fs.mkdtemp(path.join(getTempPath() || os.tmpdir(), 'nas4usb-hwpx-'));
  try {
    const htmlPath = await materializeHtmlDocument(
      input.html,
      Array.isArray(input.assets) ? input.assets : [],
      workDir,
    );
    const outPath = path.join(workDir, outName);

    const pandocDir = path.join(exportRoot, 'pandoc');
    const env = {
      ...process.env,
      PATH: `${pandocDir}${path.delimiter}${process.env.PATH ?? ''}`,
      PYTHONPATH: [
        path.join(exportRoot, 'pydeps'),
        path.join(exportRoot, 'vendor'),
        process.env.PYTHONPATH ?? '',
      ]
        .filter(Boolean)
        .join(path.delimiter),
    };

    const attempts = [
      { cmd: 'py', args: ['-3', runner, htmlPath, outPath, reference] },
      { cmd: 'python', args: [runner, htmlPath, outPath, reference] },
      { cmd: 'python3', args: [runner, htmlPath, outPath, reference] },
    ];

    let last = /** @type {{ code: number, stdout: string, stderr: string } | null} */ (null);
    for (const attempt of attempts) {
      last = await runProcess(attempt.cmd, attempt.args, { cwd: exportRoot, env });
      if (last.code === 0) break;
      // Only continue when the launcher itself is missing.
      if (!/not recognized|ENOENT|No such file/i.test(last.stderr)) break;
    }

    if (!last || last.code !== 0) {
      const detail = (last?.stderr || last?.stdout || 'unknown error').trim();
      if (/Python|pypandoc|pandoc/i.test(detail)) {
        throw new Error(
          `HWPX 변환 실패: ${detail}\n\n호스트에 Python 3가 있고, \`npm run prepare:hwpx-export\`로 Pandoc/의존성을 준비했는지 확인하세요.`,
        );
      }
      throw new Error(`HWPX 변환 실패: ${detail || `exit ${last?.code}`}`);
    }

    const bytes = await fs.readFile(outPath);
    return {
      base64: bytes.toString('base64'),
      fileName: outName,
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * @returns {Promise<{ ready: boolean, exportRoot: string, detail?: string }>}
 */
export async function getHwpxExportStatus() {
  try {
    const exportRoot = await resolveExistingExportRoot();
    await fs.access(path.join(exportRoot, 'vendor', 'pypandoc_hwpx', 'blank.hwpx'));
    return { ready: true, exportRoot };
  } catch (err) {
    return {
      ready: false,
      exportRoot: resolveHwpxExportRoot(),
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
