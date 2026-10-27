import { config } from '../config.js';
import { MemoryDriver } from './memory.driver.js';
import { MysqlDriver } from './mysql.driver.js';

let driver;

export function db() {
  if (!driver) {
    driver = config.dbDriver === 'mysql'
      ? new MysqlDriver(config.mysql)
      : new MemoryDriver(config.dataDir);
  }
  return driver;
}

export async function initDb() {
  await db().init();
}
