import { createApp } from './app.js';
import { config } from './config.js';
import { initDb } from './db/index.js';
import { seed } from './seed.js';

async function main() {
  await initDb();
  await seed();
  const app = createApp();
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`[faktorizm-api] نسخه v2 روی http://0.0.0.0:${config.port} اجرا شد (درایور: ${config.dbDriver})`);
  });

  const shutdown = (signal) => {
    console.log(`\n[${signal}] در حال توقف نرم سرور…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
  console.error('راه‌اندازی سرور شکست خورد:', e);
  process.exit(1);
});
