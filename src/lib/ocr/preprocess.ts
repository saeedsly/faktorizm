/**
 * پیش‌پردازش تصویر برای OCR — نسخه حرفه‌ای
 *
 * مراحل:
 *  ۱) بارگذاری و محدودسازی ابعاد در بازه بهینه DPI
 *  ۲) بزرگ‌نمایی اسناد کوچک
 *  ۳) تصحیح کجی سند با روش پروجکشن (projection profile)
 *  ۴) دو خروجی: خاکستری-کنتراست‌داده (ارجح) و باینری Otsu (برای اسناد کم‌کیفیت)
 */

export async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

export function bitmapToCanvas(bitmap: ImageBitmap, maxDim = 2800): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas;
}

export function makeThumbnail(source: ImageBitmap | HTMLCanvasElement, maxDim = 720): string {
  const srcW = 'width' in source ? source.width : 0;
  const srcH = 'height' in source ? source.height : 0;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  // تصویر پیش‌نمایش باید خوانا بماند؛ فشرده‌سازی ملایم به‌جای کیفیت پایین
  return canvas.toDataURL('image/jpeg', 0.9);
}

function grayBytes(canvas: HTMLCanvasElement): { data: Uint8ClampedArray; ctx: CanvasRenderingContext2D } {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = gray;
  }
  ctx.putImageData(image, 0, 0);
  return { data: d, ctx };
}

/** آستانه Otsu روی داده خاکستری */
function otsuThreshold(data: Uint8ClampedArray): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) hist[data[i]]++;
  const total = data.length / 4;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, maxVar = -1, threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > maxVar) { maxVar = between; threshold = t; }
  }
  return threshold;
}

/** تخمین زاویه کجی با واریانس پروجکشن افقی روی نسخه کوچک‌شده */
function estimateSkew(canvas: HTMLCanvasElement): number {
  const maxW = 480;
  const scale = Math.min(1, maxW / canvas.width);
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const small = document.createElement('canvas');
  small.width = w; small.height = h;
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(canvas, 0, 0, w, h);
  const img = sctx.getImageData(0, 0, w, h).data;
  // ماتریس باینری 0/1 پیکسل تیره
  const bin = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < img.length; i += 4, p++) {
    bin[p] = (0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2]) < 150 ? 1 : 0;
  }

  const score = (angle: number): number => {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const rows = new Float32Array(h);
    const cx = w / 2, cy = h / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!bin[y * w + x]) continue;
        const rx = x - cx, ry = y - cy;
        const ny = Math.round(rx * sin + ry * cos + cy);
        if (ny >= 0 && ny < h) rows[ny]++;
      }
    }
    const mean = rows.reduce((a, b) => a + b, 0) / h;
    let variance = 0;
    for (const v of rows) variance += (v - mean) ** 2;
    return variance / h;
  };

  let best = 0, bestScore = -1;
  for (let a = -8; a <= 8; a += 1) {
    const s = score(a);
    if (s > bestScore) { bestScore = s; best = a; }
  }
  // پالایش نیم‌درجه‌ای حول بهترین زاویه
  const coarse = best;
  for (let a = coarse - 1; a <= coarse + 1; a += 0.5) {
    const s = score(a);
    if (s > bestScore) { bestScore = s; best = a; }
  }
  return Math.abs(best) < 0.4 ? 0 : best;
}

function rotateCanvas(canvas: HTMLCanvasElement, angle: number): HTMLCanvasElement {
  if (!angle) return canvas;
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}

/** تصحیح کجی سند (در زاویه‌های کوچک، هزینه‌ای ندارد) */
export function deskewCanvas(canvas: HTMLCanvasElement): { canvas: HTMLCanvasElement; angle: number } {
  const angle = estimateSkew(canvas);
  return { canvas: rotateCanvas(canvas, angle), angle };
}

/** کشش کنتراست درصدی برای تصاویر کم‌رنگ/تار (روی خاکستری) */
function contrastStretch(d: Uint8ClampedArray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
  const total = d.length / 4;
  let lo = 0, hi = 255, acc = 0;
  const lowCut = total * 0.01, highCut = total * 0.99;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= lowCut) { lo = i; break; }
  }
  acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= highCut) { hi = i; break; }
  }
  if (hi <= lo) return;
  const range = hi - lo;
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - lo) / range) * 255;
    const clamped = v < 0 ? 0 : v > 255 ? 255 : v;
    d[i] = d[i + 1] = d[i + 2] = clamped;
  }
}

/**
 * نسخه خاکستری کنتراست‌داده — ارجح برای Tesseract 5 چون باینری‌سازی داخلی خودش بهتر است.
 */
export function grayscaleEnhance(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = gray;
  }
  contrastStretch(d);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** نسخه باینری Otsu — برای رسید حرارتی و اسناد پرنویز */
export function enhanceCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = gray;
  }
  const threshold = otsuThreshold(d);
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** تصاویر کوچک را برای OCR دقیق‌تر بزرگ می‌کند (هدف ~۲۰۰۰ پیکسل کمترین بُعد) */
export function upscaleIfSmall(canvas: HTMLCanvasElement, minDim = 1800): HTMLCanvasElement {
  if (Math.min(canvas.width, canvas.height) >= minDim) return canvas;
  const scale = Math.min(2.5, minDim / Math.min(canvas.width, canvas.height));
  const out = document.createElement('canvas');
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

/** تبدیل کانواس بهبودیافته به JPEG برای ارسال به سرویس ابری */
export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.94): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('تبدیل تصویر ناموفق بود'))),
      'image/jpeg',
      quality,
    );
  });
}
