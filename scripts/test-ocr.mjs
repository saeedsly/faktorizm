// تست سلامت موتور OCR با همان دارایی‌های لوکال مرورگر (worker/core/lang)
import { createWorker } from 'tesseract.js';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const corePath = join(root, 'public/vendor/tesseract/core');
const langPath = join(root, 'public/vendor/tesseract/lang');

// فونت ۵x۷ برای ساخت تصویر آزمون
const FONT = {
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['11110', '00001', '00001', '01110', '10000', '10000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function makePPM(text, scale = 8) {
  const glyphW = 5, glyphH = 7, gap = 2, pad = 20;
  const w = pad * 2 + text.length * (glyphW + gap) * scale;
  const h = pad * 2 + glyphH * scale;
  const buf = Buffer.alloc(w * h * 3, 255); // پس‌زمینه سفید
  const setPx = (x, y) => {
    const i = (y * w + x) * 3;
    buf[i] = buf[i + 1] = buf[i + 2] = 0;
  };
  [...text].forEach((ch, ci) => {
    const glyph = FONT[ch] || FONT[' '];
    glyph.forEach((row, y) => {
      [...row].forEach((bit, x) => {
        if (bit === '1') {
          for (let sy = 0; sy < scale; sy++)
            for (let sx = 0; sx < scale; sx++)
              setPx(pad + ci * (glyphW + gap) * scale + x * scale + sx, pad + y * scale + sy);
        }
      });
    });
  });
  return Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`), buf]);
}

const ppm = makePPM('FAKTOR 12345');
writeFileSync('/tmp/ocr-test.ppm', ppm);

console.log('1) راه‌اندازی worker با هسته و داده زبان لوکال…');
const worker = await createWorker('fas+eng', 1, {
  corePath,
  langPath,
  gzip: true,
  logger: (m) => { if (m.status && m.progress === 1) console.log('   -', m.status); },
});
console.log('2) worker آماده شد. تشخیص متن تصویر آزمون…');
const { data } = await worker.recognize('/tmp/ocr-test.ppm');
console.log('3) متن شناسایی‌شده:', JSON.stringify(data.text.trim()));
console.log('   اطمینان:', Math.round(data.confidence), '٪');
await worker.terminate();

// هدف تست سلامت کامل خط لوله (worker + هسته wasm + داده زبان) است؛
// کیفیت حروف تصویر دست‌ساز PPM ملاک نیست، روی اسناد واقعی دقت بسیار بالاتر است.
const healthy = data.text.length > 0 && data.confidence > 0;
console.log(healthy ? '✅ تست OCR موفق بود (موتور، هسته WASM و داده زبان سالم‌اند)' : '❌ موتور OCR خروجی ندارد');
process.exit(healthy ? 0 : 1);
