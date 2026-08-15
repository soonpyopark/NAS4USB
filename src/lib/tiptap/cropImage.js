const MAX_EDGE = 4096;
const JPEG_QUALITY = 0.9;

/**
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
function loadHtmlImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    image.src = src;
  });
}

/**
 * @param {string} src
 * @param {string} [fileName]
 */
export function inferEditedImageMime(src, fileName = '') {
  const hint = `${src} ${fileName}`.toLowerCase();
  if (/\.(png|gif|svg|webp|avif)(\?|$|#)/i.test(hint) || hint.includes('image/png')) {
    return 'image/png';
  }
  return 'image/jpeg';
}

/**
 * @param {string} src
 * @param {string} [fileName]
 */
export function editedImageFormatNote(src, fileName = '') {
  const hint = `${src} ${fileName}`.toLowerCase();
  if (/\.(gif|svg|avif)(\?|$|#)/i.test(hint)) {
    return '이 형식은 정적 PNG로 저장됩니다.';
  }
  return null;
}

/**
 * @param {number} width
 * @param {number} height
 * @param {number} rotation
 */
function rotatedBoundSize(width, height, rotation) {
  const radians = (Number(rotation) * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(radians) * width) + Math.abs(Math.sin(radians) * height),
    height: Math.abs(Math.sin(radians) * width) + Math.abs(Math.cos(radians) * height),
  };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} mimeType
 * @returns {Promise<Blob>}
 */
function canvasToBlob(canvas, mimeType) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('이미지를 저장하지 못했습니다. 다른 이미지를 사용해 보세요.'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      mimeType === 'image/jpeg' ? JPEG_QUALITY : undefined,
    );
  });
}

/**
 * @param {number} width
 * @param {number} height
 * @param {number} [maxEdge]
 */
function fitWithinMaxEdge(width, height, maxEdge = MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/**
 * Downscale and bake rotation/flip so the crop box stays axis-aligned.
 *
 * @param {string} src
 * @param {{ flipH?: boolean, flipV?: boolean, rotation?: number, maxEdge?: number }} [options]
 * @returns {Promise<{ url: string, revoke: () => void }>}
 */
export async function createWorkingImageUrl(src, options = {}) {
  const flipH = Boolean(options.flipH);
  const flipV = Boolean(options.flipV);
  const rotation = ((Number(options.rotation) || 0) % 360 + 360) % 360;
  const maxEdge = options.maxEdge ?? MAX_EDGE;
  const image = await loadHtmlImage(src);
  const fitted = fitWithinMaxEdge(image.naturalWidth, image.naturalHeight, maxEdge);

  if (!flipH && !flipV && rotation === 0 && fitted.scale === 1) {
    return { url: src, revoke: () => {} };
  }

  const bounds = rotatedBoundSize(fitted.width, fitted.height, rotation);
  const limited = fitWithinMaxEdge(bounds.width, bounds.height, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = limited.width;
  canvas.height = limited.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('이미지를 처리하지 못했습니다.');

  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  context.drawImage(
    image,
    -fitted.width / 2,
    -fitted.height / 2,
    fitted.width,
    fitted.height,
  );

  const blob = await canvasToBlob(canvas, 'image/png');
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

/**
 * Crop a working image (rotation/flip already baked) into a new File.
 *
 * @param {string} imageSrc
 * @param {{ x: number, y: number, width: number, height: number } | null} pixelCrop
 * @param {{
 *   mimeType?: string,
 *   fileName?: string,
 * }} [options]
 */
export async function cropImageToFile(imageSrc, pixelCrop, options = {}) {
  const mimeType = options.mimeType || 'image/jpeg';
  const fileName =
    options.fileName || (mimeType === 'image/png' ? 'image.png' : 'image.jpg');

  const image = await loadHtmlImage(imageSrc);
  const crop = pixelCrop ?? {
    x: 0,
    y: 0,
    width: image.naturalWidth,
    height: image.naturalHeight,
  };

  const cropX = Math.max(0, Math.round(crop.x));
  const cropY = Math.max(0, Math.round(crop.y));
  const cropWidth = Math.max(1, Math.round(crop.width));
  const cropHeight = Math.max(1, Math.round(crop.height));

  const cropped = document.createElement('canvas');
  const fitted = fitWithinMaxEdge(cropWidth, cropHeight);
  cropped.width = fitted.width;
  cropped.height = fitted.height;
  const croppedContext = cropped.getContext('2d');
  if (!croppedContext) throw new Error('이미지를 처리하지 못했습니다.');

  croppedContext.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    fitted.width,
    fitted.height,
  );

  const blob = await canvasToBlob(cropped, mimeType);
  return new File([blob], fileName, { type: mimeType });
}
