import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../server/config.js";

const argumentsList = process.argv.slice(2);
const force = argumentsList.includes("--force");
const inputArgument = argumentsList.find((argument) => argument !== "--force");

if (!inputArgument) {
  console.error("用法：node scripts/import-d1.js /path/to/d1-export.sql [--force]");
  process.exit(1);
}

const inputPath = resolve(process.cwd(), inputArgument);
if (!existsSync(inputPath) || !statSync(inputPath).isFile()) {
  throw new Error(`找不到 D1 导出文件：${inputPath}`);
}

mkdirSync(dirname(config.dbPath), { recursive: true });
if (existsSync(config.dbPath)) {
  if (!force) {
    throw new Error(
      `目标数据库已存在：${config.dbPath}\n`
      + "请先备份；确认覆盖时在命令末尾添加 --force。",
    );
  }
  const backupPath = `${config.dbPath}.before-import-${Date.now()}`;
  copyFileSync(config.dbPath, backupPath);
  rmSync(config.dbPath, { force: true });
  rmSync(`${config.dbPath}-wal`, { force: true });
  rmSync(`${config.dbPath}-shm`, { force: true });
  console.log(`旧数据库已备份到：${backupPath}`);
}

const sql = readFileSync(inputPath, "utf8");
const database = new DatabaseSync(config.dbPath);
try {
  database.exec(sql);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
  `);
} catch (error) {
  database.close();
  rmSync(config.dbPath, { force: true });
  throw error;
}
database.close();

console.log(`D1 数据已导入：${config.dbPath}`);
console.log("下一步：把 R2 对象按原 object_key 目录结构复制到 STORAGE_ROOT。");
