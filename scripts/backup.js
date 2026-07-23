import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { config } from "../server/config.js";

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

if (!existsSync(config.dbPath)) {
  throw new Error(`数据库不存在：${config.dbPath}`);
}

const destination = resolve(config.backupDir, timestamp());
mkdirSync(destination, { recursive: true });

const sourceDatabase = new DatabaseSync(config.dbPath);
try {
  await backup(sourceDatabase, resolve(destination, "gallery.sqlite"));
} finally {
  sourceDatabase.close();
}

if (existsSync(config.storageRoot)) {
  cpSync(config.storageRoot, resolve(destination, "images"), {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
}

writeFileSync(resolve(destination, "backup.json"), JSON.stringify({
  createdAt: new Date().toISOString(),
  database: "gallery.sqlite",
  images: "images/",
  note: "不包含 .env，请单独安全备份密钥。",
}, null, 2));

console.log(`备份完成：${destination}`);
