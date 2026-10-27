// کپی دارایی‌های موتور OCR (Tesseract) از node_modules به پوشه عمومی تا کاملاً آفلاین اجرا شود
import { mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'vendor', 'tesseract');

const jobs = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
];

// همه هسته‌های WASM کپی شوند (مرورگر مناسب‌ترین را انتخاب می‌کند)
const coreDir = join(root, 'node_modules/tesseract.js-core');
if (existsSync(coreDir)) {
  mkdirSync(join(out, 'core'), { recursive: true });
  for (const f of readdirSync(coreDir)) {
    if (f.endsWith('.wasm') || f.endsWith('.wasm.js')) {
      jobs.push([join('node_modules/tesseract.js-core', f), join('core', f)]);
    }
  }
}

// داده‌های زبان فارسی و انگلیسی
for (const lang of ['fas', 'eng']) {
  const rel = join('node_modules/@tesseract.js-data', lang, '4.0.0', `${lang}.traineddata.gz`);
  if (existsSync(join(root, rel))) jobs.push([rel, join('lang', `${lang}.traineddata.gz`)]);
}

let copied = 0;
for (const [from, to] of jobs) {
  const src = join(root, from);
  const dst = join(out, to);
  if (!existsSync(src)) {
    console.warn(`[ocr-assets] فایل پیدا نشد: ${from}`);
    continue;
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  copied++;
}
console.log(`[ocr-assets] ${copied} فایل موتور OCR در public/vendor/tesseract کپی شد.`);
