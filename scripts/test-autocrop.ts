/**
 * آزمون برش خودکار قاب سند
 *
 * این آزمون جلوی خطای «Cannot destructure property 'x' of ...» را می‌گیرد:
 * مثلث‌های سند فقط سه نقطه دارند و نباید به تابع هوموگرافی چهارنقطه‌ای سپرده شوند.
 * چون در محیط Node بوم (canvas) وجود ندارد، یک بوم آزمون ساده ساخته می‌شود.
 */
import { solveAffine, solveHomography, warpQuad, autoCropCanvas, quadSize } from '../src/lib/ocr/autocrop';
import type { Point, Quad } from '../src/lib/ocr/autocrop';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, info = '') {
  if (ok) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.log(`❌ ${name}${info ? ` — ${info}` : ''}`); }
}

/* -------------------------------------------------- بوم آزمون ساده */
interface Call { op: string; args: unknown[] }
const calls: Call[] = [];

function makeContext() {
  const ctx = {
    fillStyle: '#fff',
    save: () => calls.push({ op: 'save', args: [] }),
    restore: () => calls.push({ op: 'restore', args: [] }),
    beginPath: () => calls.push({ op: 'beginPath', args: [] }),
    closePath: () => calls.push({ op: 'closePath', args: [] }),
    moveTo: (...args: unknown[]) => calls.push({ op: 'moveTo', args }),
    lineTo: (...args: unknown[]) => calls.push({ op: 'lineTo', args }),
    clip: () => calls.push({ op: 'clip', args: [] }),
    fillRect: (...args: unknown[]) => calls.push({ op: 'fillRect', args }),
    drawImage: (...args: unknown[]) => calls.push({ op: 'drawImage', args }),
    setTransform: (...args: unknown[]) => calls.push({ op: 'setTransform', args }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)).fill(200),
    }),
  };
  return ctx;
}

function makeCanvas(width: number, height: number) {
  return { width, height, getContext: () => makeContext() } as unknown as HTMLCanvasElement;
}

// @ts-expect-error بوم ساختگی برای محیط Node
globalThis.document = { createElement: () => makeCanvas(16, 16) };

/* -------------------------------------------------- آفین مثلث */
const mapped = solveAffine(
  [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }],
  [{ x: 5, y: 5 }, { x: 25, y: 5 }, { x: 5, y: 25 }],
);
check('تبدیل آفین سه‌نقطه‌ای حل می‌شود', Array.isArray(mapped), JSON.stringify(mapped));
check('تبدیل آفین مقیاس دو برابر و جابه‌جایی پنج را می‌دهد',
  !!mapped && mapped[0] === 2 && mapped[1] === 0 && mapped[2] === 0 && mapped[3] === 2
  && mapped[4] === 5 && mapped[5] === 5,
  JSON.stringify(mapped));
check('مثلث تبهگن (نقاط هم‌راستا) تبدیل نمی‌سازد',
  solveAffine(
    [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }],
    [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }],
  ) === null);

/* -------------------------------------------------- محافظ هوموگرافی */
const threePoints: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
check('هوموگرافی با سه نقطه به‌جای پرتاب خطا «null» می‌دهد',
  solveHomography(threePoints, threePoints) === null);

/* -------------------------------------------------- برش قاب */
const quad: Quad = [
  { x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 220 }, { x: 10, y: 220 },
];
check('ابعاد مقصد از بلندترین ضلع قاب می‌آید', quadSize(quad).width === 100 && quadSize(quad).height === 200);

calls.length = 0;
let warped: HTMLCanvasElement | null = null;
let warpError = '';
try {
  warped = warpQuad(makeCanvas(200, 300), quad);
} catch (error) {
  warpError = String(error);
}
check('برش پرسپکتیو بدون خطا اجرا می‌شود', !warpError, warpError);
check('برش خروجی با ابعاد درست می‌سازد', !!warped && warped.width === 100 && warped.height === 200);

const transforms = calls.filter((call) => call.op === 'setTransform');
check('برای هر دو مثلث یک تبدیل تنظیم می‌شود', transforms.length === 2, String(transforms.length));
check('تبدیل‌ها جابه‌جایی درست قاب را اعمال می‌کنند',
  transforms.every((call) => call.args.length === 6 && call.args.every((v) => typeof v === 'number' && Number.isFinite(v)))
  && (transforms[0].args[4] as number) === -10 && (transforms[0].args[5] as number) === -20,
  JSON.stringify(transforms[0]?.args));

/* -------------------------------------------------- برش خودکار ایمن */
let cropError = '';
let cropResult: { canvas: HTMLCanvasElement; cropped: boolean } | null = null;
try {
  cropResult = autoCropCanvas(makeCanvas(300, 400));
} catch (error) {
  cropError = String(error);
}
check('برش خودکار روی تصویر ساده بدون خطا اجرا می‌شود', !cropError, cropError);
check('وقتی قاب مطمئن نیست همان تصویر اصلی برمی‌گردد',
  !!cropResult && cropResult.canvas.width === 300 && cropResult.cropped === false);

/* -------------------------------------------------- بوم بی‌پاسخ */
const nullContextCanvas = { width: 100, height: 100, getContext: () => null } as unknown as HTMLCanvasElement;
check('بوم بدون context باعث خطا نمی‌شود', autoCropCanvas(nullContextCanvas).cropped === false);

console.log(`\n${passed}/${passed + failed} بررسی موفق`);
if (failed > 0) process.exit(1);
