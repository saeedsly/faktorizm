/**
 * تشخیص قاب سند در عکس و تصحیح پرسپکتیو
 *
 * عکس‌های دوربین معمولاً سند را کج و با زمینه می‌گیرند؛ خوانش نویز می‌گیرد.
 * این ماژول بدون کتابخانه بیرونی:
 *  ۱) روشنایی را از کانال خاکستری می‌گیرد،
 *  ۲) «کاغذ» را از «زمینه» جدا می‌کند (پرتکرارترین روشنایی = زمینه)،
 *  ۳) گوشه‌های سند را از نقاط مرزی ماسک محتوا تخمین می‌زند،
 *  ۴) با هوموگرافی ۴ نقطه‌ای، سند را صاف و مستطیلی می‌کند،
 *  ۵) کیفیت عکس (تاری، نور، بازتاب) را می‌سنجد تا به کاربر بگوید دوباره عکس بگیرد.
 */

export interface Point { x: number; y: number }
export type Quad = [Point, Point, Point, Point];

/** روشنایی هر پیکسل در یک آرایه تک‌بعدی */
export function toGray(data: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    out[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return out;
}

/**
 * قاب سند را از ماسک محتوا پیدا می‌کند.
 * روش: پرتکرارترین روشنایی «زمینه» است؛ هر پیکسل که از زمینه به‌قدر کافی
 * تیره‌تر باشد محتواست. سپس سطر/ستون‌های دارای محتوا محدوده سند را می‌دهند
 * و در هر ربع تصویر، دورترین نقطه محتوا گوشه همان ربع است.
 */
export function findDocumentQuad(
  gray: Uint8Array,
  width: number,
  height: number,
): Quad | null {
  if (width < 20 || height < 20) return null;

  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;

  // روشنایی غالب = پس‌زمینه یا کاغذِ پرکننده کادر
  let mode = 128;
  let modeCount = -1;
  for (let v = 0; v < 256; v++) if (hist[v] > modeCount) { modeCount = hist[v]; mode = v; }

  // اوج روشنایی در بازه کاغذ (برای عکس‌های کاغذ سفید روی میز تیره)
  let paper = 235;
  let paperCount = -1;
  for (let v = 140; v < 256; v++) if (hist[v] > paperCount) { paperCount = hist[v]; paper = v; }
  const brightFraction = (() => {
    let n = 0;
    for (let v = Math.max(0, paper - 45); v < 256; v++) n += hist[v];
    return n / (width * height);
  })();

  // کاغذ تقریباً تمام کادر را پر کرده: نیازی به برش نیست
  if (brightFraction > 0.94) return null;

  /** کادر محدودکننده یک ماسک + پالایش گوشه‌ها */
  const boundsOf = (mask: Uint8Array): Quad | null => {
    const colCount = new Uint32Array(width);
    const rowCount = new Uint32Array(height);
    let count = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!mask[y * width + x]) continue;
        colCount[x]++; rowCount[y]++; count++;
      }
    }
    if (count < width * height * 0.02) return null;

    const colFloor = Math.max(2, height * 0.01);
    const rowFloor = Math.max(2, width * 0.01);
    let left = 0, right = width - 1, top = 0, bottom = height - 1;
    while (left < width && colCount[left] < colFloor) left++;
    while (right > left && colCount[right] < colFloor) right--;
    while (top < height && rowCount[top] < rowFloor) top++;
    while (bottom > top && rowCount[bottom] < rowFloor) bottom--;

    const area = (right - left) * (bottom - top);
    if (area < width * height * 0.05) return null;

    const corners: Quad = [
      { x: left, y: top }, { x: right, y: top },
      { x: right, y: bottom }, { x: left, y: bottom },
    ];
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const best4 = corners.map(() => ({ d: Number.POSITIVE_INFINITY, p: corners[0] }));
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (!mask[y * width + x]) continue;
        const q = (y < cy ? 0 : 2) + (x < cx ? 0 : 1);
        const anchor = corners[q];
        const d = (x - anchor.x) ** 2 + (y - anchor.y) ** 2;
        if (d < best4[q].d) best4[q] = { d, p: { x, y } };
      }
    }
    const refined = best4.map((b) => b.p) as Quad;
    const inside = refined.every((p) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height);
    // اگر پالایش قاب محدب نداد، همان کادر مستطیلی امن است
    return inside && isValidQuad(refined) ? refined : corners;
  };

  // حالت رایج: کاغذ روشن روی میز/زمینه تیره
  const lightMask = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) lightMask[i] = gray[i] >= paper - 45 ? 1 : 0;
  const lightQuad = boundsOf(lightMask);
  if (lightQuad) return lightQuad;

  // حالت دوم: زمینه روشن و سند تیره‌تر (تصویر معکوس یا اسکن معکوس)
  if (mode >= 140) {
    const darkMask = new Uint8Array(width * height);
    for (let i = 0; i < gray.length; i++) darkMask[i] = gray[i] <= Math.max(30, mode - 60) ? 1 : 0;
    return boundsOf(darkMask);
  }
  return null;
}

/** حل دستگاه معادلات برای هوموگرافی ۸ مجهولی (حذف گاوسی) */
export function solveHomography(src: Point[], dst: Point[]): number[] | null {
  // هوموگرافی به چهار نقطه متناظر نیاز دارد؛ با کمتر از آن معادله بی‌معنا می‌شود
  if (src.length < 4 || dst.length < 4) return null;
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const div = a[col][col];
    for (let k = col; k <= 8; k++) a[col][k] /= div;
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      if (!factor) continue;
      for (let k = col; k <= 8; k++) a[row][k] -= factor * a[col][k];
    }
  }
  return a.map((row) => row[8]);
}

/**
 * تبدیل آفین دو مثلث (شش مجهول).
 * برای کشیدن هر مثلث سند روی مثلث مقصد استفاده می‌شود؛ برخلاف هوموگرافی
 * فقط به سه نقطه نیاز دارد.
 */
export function solveAffine(src: Point[], dst: Point[]): number[] | null {
  const [p0, p1, p2] = src;
  const [q0, q1, q2] = dst;
  if (!p0 || !p1 || !p2 || !q0 || !q1 || !q2) return null;
  const u1x = p1.x - p0.x;
  const u1y = p1.y - p0.y;
  const u2x = p2.x - p0.x;
  const u2y = p2.y - p0.y;
  const det = u1x * u2y - u1y * u2x;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  const v1x = q1.x - q0.x;
  const v1y = q1.y - q0.y;
  const v2x = q2.x - q0.x;
  const v2y = q2.y - q0.y;
  // L = V · U⁻¹
  const a = (v1x * u2y - v2x * u1y) / det;
  const c = (v2x * u1x - v1x * u2x) / det;
  const b = (v1y * u2y - v2y * u1y) / det;
  const d = (v2y * u1x - v1y * u2x) / det;
  const e = q0.x - (a * p0.x + c * p0.y);
  const f = q0.y - (b * p0.x + d * p0.y);
  const out = [a, b, c, d, e, f];
  return out.every((value) => Number.isFinite(value)) ? out : null;
}

/** ابعاد مستطیل مقصد: بر پایه بلندترین ضلع قاب */
export function quadSize(quad: Quad): { width: number; height: number } {
  const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);
  const width = Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2]));
  const height = Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]));
  return { width: Math.max(16, Math.round(width)), height: Math.max(16, Math.round(height)) };
}

/** آیا راس‌ها پادساعتگرد و محدب‌اند (قاب معتبر است) */
export function isValidQuad(quad: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const c = quad[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** تصحیح پرسپکتیو با نگاشت مثلثی (بدون نیاز به پیکسل‌به‌پیکسل) */
export function warpQuad(source: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
  const { width, height } = quadSize(quad);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return source;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const dst: Quad = [
    { x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height },
  ];

  // دو مثلث: (۰,۱,۲) و (۰,۲,۳)
  const drawTriangle = (a: Point, b: Point, c: Point, da: Point, db: Point, dc: Point) => {
    const m = solveAffine([a, b, c], [da, db, dc]);
    if (!m) return;
    // m = [a, b, c, d, e, f] با ترتیب setTransform(a, b, c, d, e, f)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(da.x, da.y);
    ctx.lineTo(db.x, db.y);
    ctx.lineTo(dc.x, dc.y);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(source, 0, 0);
    ctx.restore();
  };
  drawTriangle(quad[0], quad[1], quad[2], dst[0], dst[1], dst[2]);
  drawTriangle(quad[0], quad[2], quad[3], dst[0], dst[2], dst[3]);
  return out;
}

/** برش خودکار سند از عکس؛ اگر قاب مطمئن نبود همان تصویر برمی‌گردد */
export function autoCropCanvas(canvas: HTMLCanvasElement): { canvas: HTMLCanvasElement; cropped: boolean } {
  // برش یک بهبود اختیاری است؛ هیچ خطایی نباید پردازش سند را متوقف کند
  try {
    return autoCropUnsafe(canvas);
  } catch {
    return { canvas, cropped: false };
  }
}

function autoCropUnsafe(canvas: HTMLCanvasElement): { canvas: HTMLCanvasElement; cropped: boolean } {
  const maxW = 600;
  const scale = Math.min(1, maxW / Math.max(canvas.width, canvas.height));
  const w = Math.max(20, Math.round(canvas.width * scale));
  const h = Math.max(20, Math.round(canvas.height * scale));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  if (!sctx) return { canvas, cropped: false };
  sctx.drawImage(canvas, 0, 0, w, h);
  const gray = toGray(sctx.getImageData(0, 0, w, h).data);
  const quad = findDocumentQuad(gray, w, h);
  if (!quad || !isValidQuad(quad)) return { canvas, cropped: false };
  const scaled: Quad = quad.map((p) => ({ x: p.x / scale, y: p.y / scale })) as Quad;
  const warped = warpQuad(canvas, scaled);
  // برش نباید بیش از نیمی از سند را ببلعد
  if (warped.width * warped.height < canvas.width * canvas.height * 0.25) {
    return { canvas, cropped: false };
  }
  return { canvas: warped, cropped: true };
}

export interface PhotoQuality {
  sharpness: number;
  brightness: number;
  glare: number;
  verdict: 'good' | 'fair' | 'poor';
  hints: string[];
}

/** سنجش کیفیت عکس: تاری، نور و بازتاب */
export function photoQuality(canvas: HTMLCanvasElement): PhotoQuality {
  try {
    return photoQualityUnsafe(canvas);
  } catch {
    return { sharpness: 0, brightness: 0, glare: 0, verdict: 'fair', hints: ['سنجش کیفیت برای این تصویر ممکن نشد؛ خوانش ادامه پیدا می‌کند.'] };
  }
}

function photoQualityUnsafe(canvas: HTMLCanvasElement): PhotoQuality {
  const maxW = 700;
  const scale = Math.min(1, maxW / Math.max(canvas.width, canvas.height));
  const w = Math.max(16, Math.round(canvas.width * scale));
  const h = Math.max(16, Math.round(canvas.height * scale));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const ctx = small.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(canvas, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const gray = toGray(data);

  let sum = 0;
  let bright = 0;
  for (let i = 0; i < gray.length; i++) {
    sum += gray[i];
    if (gray[i] > 248) bright++;
  }
  const brightness = Math.round((sum / gray.length / 255) * 100);
  const glare = Math.round((bright / gray.length) * 100);

  // واریانس لاپلاسیان = سنجه تیزی
  let lapSum = 0;
  let lapSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w];
      lapSum += lap;
      lapSq += lap * lap;
      count++;
    }
  }
  const mean = count ? lapSum / count : 0;
  const sharpness = Math.round(count ? lapSq / count - mean * mean : 0);

  const hints: string[] = [];
  if (sharpness < 60) hints.push('تصویر تار است؛ دوربین را ثابت بگیرید و دوباره عکس بگیرید.');
  if (brightness < 30) hints.push('نور کافی نیست؛ سند را نزدیک پنجره یا زیر نور سفید بگیرید.');
  if (brightness > 92) hints.push('نور بیش از حد است؛ سایه دوربین روی کاغذ نیفتد.');
  if (glare > 4) hints.push('بازتاب نور روی کاغذ افتاده؛ از زاویه دیگری عکس بگیرید.');

  const verdict: PhotoQuality['verdict'] =
    hints.length === 0 ? 'good' : hints.length === 1 && sharpness >= 40 ? 'fair' : 'poor';

  return { sharpness, brightness, glare, verdict, hints };
}
