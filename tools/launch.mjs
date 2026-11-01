#!/usr/bin/env node
/**
 * راه‌انداز فاکتوریزم — همهٔ منطق نصب و اجرا داخل همین فایل است.
 *
 * چرا؟ فایل‌های .bat ویندوز شکننده‌اند (متغیر داخل بلوک، powershell، goto) و
 * قابل آزمون نیستند. اینجا همه‌چیز جاوااسکریپت است: روی ویندوز و لینوکس یکی
 * است، خروجی روشن دارد و می‌شود قبل از تحویل واقعاً اجرایش کرد.
 *
 * فرمان‌ها:
 *   node tools/launch.mjs setup    نصب یک‌باره (وابستگی سرور + محیط پایتون + گزارش موتورها)
 *   node tools/launch.mjs start    اجرای برنامه (سرویس OCR + سرور + باز کردن مرورگر)
 *   node tools/launch.mjs check    گزارش کامل وضعیت؛ فایل doctor-report.txt هم می‌سازد
 *   node tools/launch.mjs falcon   نصب Falcon-OCR (دقیق‌ترین موتور، حدود ۱٫۱ گیگابایت)
 *
 * گزینه‌ها:
 *   --root <dir>   ریشهٔ بسته (پیش‌فرض: پوشهٔ بالای tools)
 *   --port <n>     پورت برنامه (پیش‌فرض 8787 یا مقدار PORT در .env)
 *   --no-open      مرورگر را باز نکن
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const command = (argv.find((a) => !a.startsWith('-')) || 'start').toLowerCase();

function opt(name, fallback = '') {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
}

const ROOT = opt('root', join(HERE, '..'));
const IS_WIN = process.platform === 'win32';
const OCR_DIR = join(ROOT, 'ocr-service');
const VENV_PY = IS_WIN
  ? join(OCR_DIR, '.venv', 'Scripts', 'python.exe')
  : join(OCR_DIR, '.venv', 'bin', 'python');

const lines = [];
function say(text = '') {
  lines.push(text);
  console.log(text);
}
function head(text) {
  say('');
  say('='.repeat(60));
  say(`  ${text}`);
  say('='.repeat(60));
}

/** اجرای یک فرمان و برگرداندن خروجی؛ هرگز استثنا نمی‌دهد */
function run(cmd, args, { cwd = ROOT, quiet = false, input = null } = {}) {
  const res = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    input: input ?? undefined,
    shell: false,
    timeout: 30 * 60 * 1000,
    windowsHide: true,
  });
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
  if (!quiet && out) console.log(out);
  return { ok: res.status === 0, status: res.status, out, error: res.error };
}

// ------------------------------------------------------------------ تشخیص پایتون
function findPython() {
  if (process.env.FH_PYTHON) {
    return { cmd: process.env.FH_PYTHON, args: [], label: process.env.FH_PYTHON };
  }
  const candidates = IS_WIN
    ? [
      { cmd: 'py', args: ['-3.11'], label: 'py -3.11' },
      { cmd: 'py', args: ['-3.12'], label: 'py -3.12' },
      { cmd: 'py', args: ['-3.10'], label: 'py -3.10' },
      { cmd: 'py', args: ['-3'], label: 'py -3' },
      { cmd: 'python', args: [], label: 'python' },
    ]
    : [
      { cmd: 'python3.11', args: [], label: 'python3.11' },
      { cmd: 'python3', args: [], label: 'python3' },
      { cmd: 'python', args: [], label: 'python' },
    ];
  for (const candidate of candidates) {
    const probe = run(candidate.cmd, [...candidate.args, '-c', 'import sys;print(sys.version_info[:2])'], { quiet: true });
    if (probe.ok && /\(3, (1[0-9]|[2-9][0-9])\)/.test(probe.out.replace(/\s/g, ' ').replace(/, /g, ', '))) {
      return candidate;
    }
  }
  return null;
}

function venvPython() {
  return existsSync(VENV_PY) ? VENV_PY : null;
}

/**
 * پایتون قابل استفاده: اول محیط اختصاصی بسته، بعد پایتون سیستم.
 * خروجی: { cmd, prefix } — prefix همان آرگومان‌های لازم قبل از -m است
 * (مثلاً «py -3.11» ⇒ ['-3.11']).
 */
function pythonFor() {
  const v = venvPython();
  if (v) return { cmd: v, prefix: [], label: v, isVenv: true };
  const found = findPython();
  if (!found) return null;
  return { cmd: found.cmd, prefix: found.args, label: found.label, isVenv: false };
}

// ------------------------------------------------------------------ بررسی‌ها
function readEnvFile() {
  const file = join(ROOT, '.env');
  const env = {};
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

function writeEnvFileIfMissing() {
  const file = join(ROOT, '.env');
  if (existsSync(file)) return false;
  writeFileSync(file, [
    'PORT=8787',
    'NODE_ENV=production',
    'DB_DRIVER=memory',
    'MYSQL_HOST=127.0.0.1',
    'MYSQL_PORT=3306',
    'MYSQL_USER=root',
    'MYSQL_PASSWORD=',
    'MYSQL_DATABASE=faktorizm',
    'WEB_DIR=./web',
    'DATA_DIR=./data',
    'ADMIN_EMAIL=admin@faktorizm.ir',
    'ADMIN_PASSWORD=Admin@1405',
    'JWT_SECRET=change-this-jwt-secret-0123456789abcdefghij',
    'REFRESH_SECRET=change-this-refresh-secret-0123456789ab',
    'CORS_ORIGINS=http://localhost:8787,http://127.0.0.1:8787',
    'OCR_SERVICE_URL=http://127.0.0.1:8789',
    'OCR_PORT=8789',
    'OCR_ENGINE=auto',
    '',
  ].join('\r\n'), 'utf8');
  return true;
}

function checkLayout() {
  const web = join(ROOT, 'web', 'index.html');
  const server = join(ROOT, 'server', 'src', 'index.js');
  const serverPkg = join(ROOT, 'server', 'node_modules', 'express', 'package.json');
  return {
    web: existsSync(web),
    server: existsSync(server),
    deps: existsSync(serverPkg),
    ocr: existsSync(join(OCR_DIR, 'service.py')),
    venv: !!venvPython(),
    env: existsSync(join(ROOT, '.env')),
  };
}

function packageVersion() {
  for (const dir of ['web', 'dist']) {
    try {
      const bundle = readFileSync(join(ROOT, dir, 'index.html'), 'utf8');
      const m = bundle.match(/index-([A-Za-z0-9_-]+)\.js/);
      if (m) return m[1];
    } catch { /* پوشهٔ بعدی */ }
  }
  return '?';
}

async function healthOf(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    try {
      return { ok: res.ok, json: JSON.parse(text) };
    } catch {
      return { ok: false, json: null, raw: text.slice(0, 120) };
    }
  } catch (err) {
    return { ok: false, json: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '0.0.0.0');
  });
}

// ------------------------------------------------------------------ setup
function installServerDeps() {
  if (existsSync(join(ROOT, 'server', 'node_modules', 'express'))) {
    say('  [ok] وابستگی‌های سرور از قبل داخل بسته هست.');
    return true;
  }
  say('  ... نصب وابستگی‌های سرور (npm install)');
  const res = run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: join(ROOT, 'server') });
  say(res.ok ? '  [ok] وابستگی‌های سرور نصب شد.' : '  [!!] npm install موفق نشد — بدون اینترنت نمی‌شود.');
  return res.ok;
}

function ensureVenv(python) {
  if (venvPython()) {
    say('  [ok] محیط اختصاصی پایتون از قبل ساخته شده.');
    return true;
  }
  say('  ... ساخت محیط اختصاصی پایتون (ocr-service/.venv)');
  const res = run(python.cmd, [...python.args, '-m', 'venv', join(OCR_DIR, '.venv')]);
  if (res.ok && venvPython()) {
    say('  [ok] محیط ساخته شد.');
    return true;
  }
  say('  [!!] ساخت محیط ناموفق بود؛ از پایتون سیستم استفاده می‌کنم.');
  return false;
}

function installOcrDeps() {
  const wheels = join(OCR_DIR, 'wheels');
  const py = pythonFor();
  if (!py) return false;
  const cmd = py.cmd;
  const baseArgs = py.prefix;
  const useWheels = existsSync(wheels);

  say(`  ... نصب بسته‌های OCR ${useWheels ? 'از پوشهٔ wheels (آفلاین)' : 'از اینترنت (حدود ۶۰ مگابایت)'}`);
  run(cmd, [...baseArgs, '-m', 'pip', 'install', '--upgrade', 'pip'], { quiet: true });
  const args = [...baseArgs, '-m', 'pip', 'install', '-r', join(OCR_DIR, 'requirements.txt')];
  if (useWheels) args.push('--no-index', '--find-links', wheels);
  let res = run(cmd, args);
  if (!res.ok && py.isVenv) {
    say('  [!!] نصب در محیط اختصاصی نشد؛ تلاش با پایتون سیستم و --user');
    const sys = findPython();
    if (sys) {
      res = run(sys.cmd, [...sys.args, '-m', 'pip', 'install', '--user', '-r', join(OCR_DIR, 'requirements.txt')]);
    }
  }
  say(res.ok ? '  [ok] بسته‌های OCR نصب شد.' : '  [!!] نصب بسته‌های OCR ناموفق بود؛ برنامه با موتور مرورگر کار می‌کند.');
  return res.ok;
}

function printEngineReport() {
  const py = pythonFor();
  if (!py) {
    say('  [!!] پایتون پیدا نشد؛ موتور قوی نصب نمی‌شود.');
    return false;
  }
  const res = run(py.cmd, [...py.prefix, join(OCR_DIR, 'check_engines.py')], { quiet: true });
  if (res.out) {
    // خروجی گزارش انگلیسی است؛ همان را نشان می‌دهیم تا در هر کنسولی خوانا باشد
    say(res.out.split('\n').map((l) => `  ${l}`).join('\n'));
  }
  return res.ok;
}

async function cmdSetup() {
  head('فاکتوریزم — نصب یک‌باره');
  say(`  مسیر بسته: ${ROOT}`);
  say(`  نسخهٔ رابط: ${packageVersion()}`);

  const layout = checkLayout();
  if (!layout.web || !layout.server) {
    say('');
    say('  [خطا] فایل‌های برنامه کامل نیست؛ زیپ را دوباره Extract کنید (کل پوشه).');
    say(`        web/index.html: ${layout.web ? 'هست' : 'نیست'} · server/src/index.js: ${layout.server ? 'هست' : 'نیست'}`);
    return 2;
  }

  say('');
  say('۱) بررسی Node');
  say(`  [ok] Node ${process.version}`);
  if (Number(process.versions.node.split('.')[0]) < 20) {
    say('  [!!] Node 20 یا بالاتر لازم است؛ از nodejs.org نسخهٔ LTS را نصب کنید.');
  }

  say('');
  say('۲) وابستگی‌های سرور');
  installServerDeps();

  if (writeEnvFileIfMissing()) say('  [ok] فایل .env ساخته شد (پیش‌فرض بدون MySQL).');

  say('');
  say('۳) موتور خواندن محلی (اختیاری ولی توصیه‌شده)');
  if (!layout.ocr) {
    say('  [--] این بسته پوشهٔ ocr-service ندارد (نسخهٔ سبک است).');
  } else {
    const python = findPython();
    if (!python) {
      say('  [!!] پایتون پیدا نشد. برنامه کار می‌کند ولی با موتور مرورگر می‌خواند.');
      say('        برای موتور قوی: Python 3.11 را از python.org نصب کنید');
      say('        و هنگام نصب تیک "Add python.exe to PATH" را بزنید، بعد دوباره setup.');
    } else {
      say(`  [ok] پایتون: ${python.label}`);
      ensureVenv(python);
      installOcrDeps();
    }
  }

  say('');
  say('۴) گزارش موتورها');
  printEngineReport();

  say('');
  head('نصب تمام شد');
  say('  بعدی: start.bat (یا: node tools/launch.mjs start)');
  say('  آدرس: http://localhost:8787');
  say('  ورود: admin@faktorizm.ir / Admin@1405');
  say('');
  saveReport('setup');
  return 0;
}

// ------------------------------------------------------------------ start
async function cmdStart() {
  head('فاکتوریزم — اجرا');
  const layout = checkLayout();
  if (!layout.web || !layout.server) {
    say('  [خطا] فایل‌های برنامه کامل نیست. زیپ را دوباره Extract کنید.');
    saveReport('start');
    return 2;
  }
  writeEnvFileIfMissing();
  const env = readEnvFile();
  const port = Number(opt('port', env.PORT || '8787'));
  const ocrPort = Number(env.OCR_PORT || '8789');

  // اگر پورت اشغال است، یعنی نمونهٔ قبلی هنوز باز است
  if (!(await portIsFree(port))) {
    say(`  [!!] پورت ${port} در حال استفاده است — برنامه احتمالاً از قبل باز است.`);
    say(`        همین آدرس را در مرورگر باز کنید: http://localhost:${port}`);
    say('        اگر باز نشد، stop.bat را بزنید و دوباره start.');
    return 3;
  }

  let ocrChild = null;
  const already = await healthOf(`http://127.0.0.1:${ocrPort}/health`, 1500);
  if (already.ok) {
    say(`  [ok] سرویس موتور خواندن از قبل روی پورت ${ocrPort} روشن است — همان استفاده می‌شود.`);
    say(`       موتور: ${already.json?.engine ?? '?'} · واژه‌نامه: ${already.json?.diagnostics?.dictionary?.words ?? '?'} واژه`);
  } else if (layout.ocr && layout.venv) {
    say('  ... روشن کردن سرویس موتور خواندن');
    ocrChild = spawn(venvPython(), [join(OCR_DIR, 'service.py')], {
      cwd: OCR_DIR,
      env: { ...process.env, OCR_PORT: String(ocrPort), OCR_ENGINE: env.OCR_ENGINE || 'auto' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    ocrChild.stdout.on('data', (d) => {
      const text = String(d).trim();
      if (text) say(`    [ocr] ${text}`);
    });
    ocrChild.stderr.on('data', (d) => {
      const text = String(d).trim();
      if (text) say(`    [ocr] ${text}`);
    });

    let health = null;
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 1000));
      health = await healthOf(`http://127.0.0.1:${ocrPort}/health`);
      if (health.ok) break;
    }
    if (health?.ok) {
      const engine = health.json?.engine ?? '?';
      const dict = health.json?.diagnostics?.dictionary?.words ?? '?';
      say(`  [ok] موتور خواندن آماده است: ${engine} · واژه‌نامه: ${dict} واژه`);
      const engines = health.json?.diagnostics?.engines ?? [];
      for (const e of engines) {
        say(`       ${e.ready ? '[ok]' : '[--]'} ${e.label}${e.ready ? '' : ` — ${e.reasonEn || e.reason}`}`);
      }
    } else {
      say('  [!!] سرویس موتور خواندن جواب نداد؛ برنامه با موتور مرورگر شروع می‌شود.');
      say('        دلیل: check-engines.bat را بزنید (یا: node tools/launch.mjs check)');
    }
  } else if (already.ok) {
    // سرویس از قبل روشن بود؛ گزارشش را همان بالا دادیم
  } else if (layout.ocr && !layout.venv) {
    say('  [!!] محیط پایتون ساخته نشده؛ ابتدا setup.bat را اجرا کنید.');
    say('        بدون آن، خواندن با موتور مرورگر انجام می‌شود.');
  } else {
    say('  [--] این بسته سرویس محلی ندارد؛ خواندن با موتور مرورگر یا سرویس ابری.');
  }

  say('');
  say(`  برنامه روی http://localhost:${port} بالا می‌آید...`);
  const app = spawn(process.execPath, [join(ROOT, 'server', 'src', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...env,
      PORT: String(port),
      OCR_SERVICE_URL: `http://127.0.0.1:${ocrPort}`,
      OCR_PORT: String(ocrPort),
    },
    stdio: 'inherit',
    windowsHide: true,
  });

  // منتظر آماده شدن سرور، بعد باز کردن مرورگر
  let up = false;
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    const res = await healthOf(`http://127.0.0.1:${port}/api/v2/health`, 1500);
    if (res.ok) { up = true; break; }
  }
  if (up) {
    say(`  [ok] برنامه آماده است: http://localhost:${port}`);
    if (!argv.includes('--no-open')) openBrowser(`http://localhost:${port}`);
  } else {
    say('  [!!] برنامه بالا نیامد. خروجی خطای بالا را بفرستید.');
  }

  const stop = () => {
    try { app.kill(); } catch { /* noop */ }
    if (ocrChild) { try { ocrChild.kill(); } catch { /* noop */ } }
  };
  process.on('SIGINT', () => { stop(); process.exit(0); });
  process.on('SIGTERM', () => { stop(); process.exit(0); });
  app.on('exit', (code) => {
    say(`  سرور بسته شد (کد ${code}).`);
    if (ocrChild) { try { ocrChild.kill(); } catch { /* noop */ } }
    process.exit(code ?? 0);
  });
  return null; // فرایند همچنان زنده است
}

function openBrowser(url) {
  const cmd = IS_WIN ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = IS_WIN ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  } catch { /* بدون مرورگر هم برنامه کار می‌کند */ }
}

// ------------------------------------------------------------------ check
async function cmdCheck() {
  head('فاکتوریزم — گزارش وضعیت');
  const layout = checkLayout();
  say(`  مسیر بسته      : ${ROOT}`);
  say(`  نسخهٔ رابط     : ${packageVersion()}`);
  say(`  Node           : ${process.version} (${process.platform})`);
  say(`  web/index.html : ${layout.web ? 'هست' : 'نیست'}`);
  say(`  server         : ${layout.server ? 'هست' : 'نیست'}`);
  say(`  وابستگی سرور   : ${layout.deps ? 'هست' : 'نیست'}`);
  say(`  ocr-service    : ${layout.ocr ? 'هست' : 'نیست (نسخهٔ سبک)'}`);
  say(`  .venv پایتون   : ${layout.venv ? VENV_PY : 'ساخته نشده'}`);

  const python = findPython();
  say(`  پایتون سیستم   : ${python ? python.label : 'پیدا نشد'}`);

  const env = readEnvFile();
  say(`  .env           : ${layout.env ? `${Object.keys(env).length} متغیر (PORT=${env.PORT ?? '؟'})` : 'نیست'}`);

  const env2 = readEnvFile();
  const ocrPort = Number(env2.OCR_PORT || '8789');
  const health = await healthOf(`http://127.0.0.1:${ocrPort}/health`);
  if (health.ok && health.json) {
    say(`  سرویس OCR      : روشن — ${health.json.engine ?? '?'}`);
    const diag = health.json.diagnostics ?? {};
    say(`  واژه‌نامه       : ${diag.dictionary?.words ?? '?'} واژه`);
    for (const e of diag.engines ?? []) {
      say(`    ${e.ready ? '[ok]' : '[--]'} ${e.id}: ${e.ready ? 'آماده' : (e.reasonEn || e.reason)}`);
    }
  } else {
    say(`  سرویس OCR      : خاموش (${health.error ?? 'پاسخی نداد'})`);
    say('                   یعنی برنامه با موتور مرورگر می‌خواند.');
  }

  printEngineReport();
  say('');
  say('  این گزارش در فایل doctor-report.txt ذخیره شد.');
  saveReport('check');
  return 0;
}

function saveReport(kind) {
  try {
    const file = join(ROOT, 'doctor-report.txt');
    writeFileSync(file, [
      `faktorizm ${kind} report`,
      `date: ${new Date().toISOString()}`,
      `platform: ${process.platform} ${process.arch}`,
      `node: ${process.version}`,
      `root: ${ROOT}`,
      '',
      ...lines,
      '',
    ].join('\r\n'), 'utf8');
  } catch { /* نوشتن گزارش اختیاری است */ }
}

// ------------------------------------------------------------------ falcon
async function cmdFalcon() {
  head('نصب Falcon-OCR (دقیق‌ترین موتور)');
  const py = venvPython();
  if (!py) {
    say('  [خطا] اول setup.bat را اجرا کنید (محیط پایتون ساخته شود).');
    return 2;
  }
  say('  حجم: حدود ۱٫۱ گیگابایت وزن + ۲ تا ۳ گیگابایت torch — فقط یک‌بار.');
  say('');
  say('  ... نصب torch و transformers');
  const install = run(py, ['-m', 'pip', 'install', '-r', join(OCR_DIR, 'requirements-falcon.txt'), 'huggingface_hub']);
  if (!install.ok) {
    say('  [!!] نصب نشد. اینترنت/فایروال را بررسی کنید.');
    say('        اگر huggingface.co بسته است، وزن‌ها را جای دیگری دانلود کنید و در');
    say('        ocr-service/models/falcon-ocr-arabic بگذارید.');
    saveReport('falcon');
    return 3;
  }
  say('  ... دانلود وزن‌های مدل');
  const download = run(py, [join(OCR_DIR, 'download_models.py'), '--falcon']);
  if (!download.ok) {
    say('  [!!] دانلود ناموفق بود؛ پیام بالا را بفرستید.');
    saveReport('falcon');
    return 4;
  }
  printEngineReport();
  saveReport('falcon');
  return 0;
}

// ------------------------------------------------------------------ main
const map = { setup: cmdSetup, start: cmdStart, check: cmdCheck, falcon: cmdFalcon };
const fn = map[command];
if (!fn) {
  console.log('فرمان‌ها: setup | start | check | falcon');
  process.exit(2);
}
fn().then((code) => {
  if (code !== null && code !== undefined) process.exit(code);
}).catch((err) => {
  console.error('خطای غیرمنتظره:', err);
  process.exit(1);
});
