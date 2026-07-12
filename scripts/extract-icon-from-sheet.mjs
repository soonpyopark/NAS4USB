/**
 * Extract the hero USB icon from build/icon-sheet.png → build/icon-source.png (1024px).
 * Used by prepare-app-icon.mjs when an icon sheet is present.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const buildDir = path.join(projectRoot, 'build');
const sheetPath = path.join(buildDir, 'icon-sheet.png');
const outSource = path.join(buildDir, 'icon-source.png');

function isBg(r, g, b, a) {
  if (a < 16) return true;
  const bright = (r + g + b) / 3;
  if (bright > 205 && Math.abs(r - g) < 35 && Math.abs(g - b) < 45) return true;
  if (r > 185 && g > 205 && b > 215 && bright > 200) return true;
  if (r > 200 && g > 215 && b > 225) return true;
  return false;
}

function isContent(r, g, b, a) {
  if (isBg(r, g, b, a)) return false;
  const bright = (r + g + b) / 3;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  if (bright > 170 && sat < 35) return false;
  if (sat < 20 && bright > 80 && bright < 180) return false;
  return true;
}

/**
 * @param {string} [sheetOverride]
 * @returns {Promise<string | null>} path to icon-source.png, or null if sheet missing
 */
export async function extractIconSourceFromSheet(sheetOverride = sheetPath) {
  if (!fs.existsSync(sheetOverride)) return null;

  const meta = await sharp(sheetOverride).metadata();
  const sampleW = 512;
  const scale = sampleW / meta.width;
  const sampleH = Math.round(meta.height * scale);
  const { data, info } = await sharp(sheetOverride)
    .resize(sampleW, sampleH)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;
  const visited = new Uint8Array(W * H);
  const boxes = [];

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      if (visited[i]) continue;
      const idx = i * 4;
      if (!isContent(data[idx], data[idx + 1], data[idx + 2], data[idx + 3])) {
        visited[i] = 1;
        continue;
      }
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      const stack = [[x, y]];
      visited[i] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        count += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (const [nx, ny] of [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (visited[ni]) continue;
          const nidx = ni * 4;
          if (!isContent(data[nidx], data[nidx + 1], data[nidx + 2], data[nidx + 3])) {
            visited[ni] = 1;
            continue;
          }
          visited[ni] = 1;
          stack.push([nx, ny]);
        }
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (count < 200 || bw < 40 || bh < 40) continue;
      const aspect = bw / bh;
      if (aspect < 0.7 || aspect > 1.35) continue;
      const fullX = minX / scale;
      boxes.push({
        minX: Math.round(minX / scale),
        minY: Math.round(minY / scale),
        w: Math.round(bw / scale),
        h: Math.round(bh / scale),
        count,
        score: count * (fullX < meta.width * 0.4 ? 3 : 1) * (bw * bh),
      });
    }
  }

  boxes.sort((a, b) => b.score - a.score);
  if (!boxes.length) {
    console.warn('[icons] icon sheet present but no hero icon found');
    return null;
  }

  const best = boxes[0];
  const pad = Math.round(Math.max(best.w, best.h) * 0.06);
  const left = Math.max(0, best.minX - pad);
  const top = Math.max(0, best.minY - pad);
  const right = Math.min(meta.width, best.minX + best.w + pad);
  const bottom = Math.min(meta.height, best.minY + best.h + pad);
  const cropW = right - left;
  const cropH = bottom - top;

  const { data: cropData, info: cropInfo } = await sharp(sheetOverride)
    .extract({ left, top, width: cropW, height: cropH })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Buffer.from(cropData);
  for (let i = 0; i < cropInfo.width * cropInfo.height; i += 1) {
    const idx = i * 4;
    if (isBg(pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3])) {
      pixels[idx + 3] = 0;
    }
  }

  const trimmedPng = await sharp(pixels, {
    raw: { width: cropInfo.width, height: cropInfo.height, channels: 4 },
  })
    .trim({ threshold: 10 })
    .png()
    .toBuffer();

  const trimmedMeta = await sharp(trimmedPng).metadata();
  const side = Math.max(trimmedMeta.width, trimmedMeta.height);
  const canvas = Math.ceil(side * 1.2);
  const ox = Math.floor((canvas - trimmedMeta.width) / 2);
  const oy = Math.floor((canvas - trimmedMeta.height) / 2);

  const squared = await sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: trimmedPng, left: ox, top: oy }])
    .png()
    .toBuffer();

  const master = await sharp(squared)
    .resize(1024, 1024, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();

  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(outSource, master);
  console.log(
    `[icons] extracted hero from icon-sheet (${cropW}x${cropH} @${left},${top}) → icon-source.png`,
  );
  return outSource;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await extractIconSourceFromSheet();
  if (!result) {
    console.error('[icons] build/icon-sheet.png not found');
    process.exit(1);
  }
}
