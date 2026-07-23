import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runScript(script, args, env) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: "1", ...env },
    encoding: "utf8",
  });
}

test("D1 import and backup scripts preserve database and image data", () => {
  const root = mkdtempSync(resolve(tmpdir(), "roco-vps-maintenance-"));
  const databasePath = resolve(root, "gallery.sqlite");
  const storageRoot = resolve(root, "images");
  const backupRoot = resolve(root, "backups");
  const exportPath = resolve(root, "d1-export.sql");
  const migrations = [
    "0001_gallery.sql",
    "0002_categories.sql",
    "0003_settings.sql",
    "0004_friends_comments.sql",
    "0005_performance.sql",
  ].map((file) => readFileSync(resolve(ROOT, "migrations", file), "utf8")).join("\n");
  writeFileSync(exportPath, `${migrations}
INSERT INTO gallery_items (
  id, object_key, category, title, comment, shot_at, tags_json,
  content_type, size, is_pinned, pinned_until, is_featured, featured_until,
  created_at, updated_at
) VALUES (
  'test-image-1234', 'gallery/test-image-1234.webp', 'ringo',
  '', '', '2026-07-23 12:00:00', '[]', 'image/webp', 4,
  0, NULL, 0, NULL, '2026-07-23T12:00:00.000Z', '2026-07-23T12:00:00.000Z'
);
`, "utf8");

  const env = {
    DATA_DIR: root,
    DB_PATH: databasePath,
    STORAGE_ROOT: storageRoot,
    BACKUP_DIR: backupRoot,
  };

  try {
    const imported = runScript("scripts/import-d1.js", [exportPath], env);
    assert.equal(imported.status, 0, imported.stderr || imported.stdout);

    const database = new DatabaseSync(databasePath);
    try {
      const row = database.prepare(
        "SELECT object_key FROM gallery_items WHERE id = ?",
      ).get("test-image-1234");
      assert.equal(row.object_key, "gallery/test-image-1234.webp");
    } finally {
      database.close();
    }

    mkdirSync(resolve(storageRoot, "gallery"), { recursive: true });
    writeFileSync(resolve(storageRoot, "gallery", "test-image-1234.webp"), "RIFF");

    const backedUp = runScript("scripts/backup.js", [], env);
    assert.equal(backedUp.status, 0, backedUp.stderr || backedUp.stdout);
    const backups = readdirSync(backupRoot);
    assert.equal(backups.length, 1);
    const destination = resolve(backupRoot, backups[0]);
    assert.equal(
      readFileSync(resolve(destination, "images", "gallery", "test-image-1234.webp"), "utf8"),
      "RIFF",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
