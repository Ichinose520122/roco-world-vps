import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const separator = trimmed.indexOf("=");
  if (separator < 1) return null;
  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return [key, value.replace(/\\n/g, "\n")];
}

function loadEnvFile() {
  const path = resolve(ROOT_DIR, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function integer(name, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function projectPath(value, fallback) {
  const input = String(value || fallback);
  return isAbsolute(input) ? resolve(input) : resolve(ROOT_DIR, input);
}

loadEnvFile();

const maxUploadBytes = integer("MAX_UPLOAD_BYTES", 25 * 1024 * 1024, 1024);

export const config = Object.freeze({
  rootDir: ROOT_DIR,
  publicDir: resolve(ROOT_DIR, "public"),
  host: String(process.env.HOST || "127.0.0.1"),
  port: integer("PORT", 3000, 1, 65535),
  dataDir: projectPath(process.env.DATA_DIR, "./data"),
  dbPath: projectPath(process.env.DB_PATH, "./data/gallery.sqlite"),
  storageRoot: projectPath(process.env.STORAGE_ROOT, "./data/images"),
  backupDir: projectPath(process.env.BACKUP_DIR, "./data/backups"),
  adminUsername: String(process.env.ADMIN_USERNAME || "admin"),
  adminPassword: String(process.env.ADMIN_PASSWORD || ""),
  friendIdSecret: String(process.env.FRIEND_ID_SECRET || ""),
  friendSessionDays: integer("FRIEND_SESSION_DAYS", 30, 1, 90),
  maxUploadBytes,
  maxRequestBytes: integer(
    "MAX_REQUEST_BYTES",
    maxUploadBytes + 2 * 1024 * 1024,
    maxUploadBytes,
  ),
  cacheMaxBytes: integer("CACHE_MAX_BYTES", 64 * 1024 * 1024, 0),
  cacheMaxObjectBytes: integer("CACHE_MAX_OBJECT_BYTES", 8 * 1024 * 1024, 0),
});

export function publicConfigSummary() {
  return {
    host: config.host,
    port: config.port,
    dataDir: config.dataDir,
    dbPath: config.dbPath,
    storageRoot: config.storageRoot,
    backupDir: config.backupDir,
    maxUploadBytes: config.maxUploadBytes,
    adminConfigured: config.adminPassword.length >= 16,
    friendLoginConfigured: config.friendIdSecret.length >= 16,
  };
}
