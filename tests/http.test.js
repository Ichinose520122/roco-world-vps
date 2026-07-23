import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

async function waitForServer(url, child, logs) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`服务提前退出：\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`${url}/healthz`);
      if (response.ok) return;
    } catch {
      // The listener may not be ready yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`等待服务启动超时：\n${logs.join("")}`);
}

test("HTTP server protects admin and preserves friend sessions", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "roco-vps-http-"));
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const username = "ringo";
  const password = "a-very-long-admin-password";
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  const logs = [];

  const child = spawn(process.execPath, ["server/server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_NO_WARNINGS: "1",
      HOST: "127.0.0.1",
      PORT: String(port),
      DATA_DIR: root,
      DB_PATH: resolve(root, "gallery.sqlite"),
      STORAGE_ROOT: resolve(root, "images"),
      BACKUP_DIR: resolve(root, "backups"),
      ADMIN_USERNAME: username,
      ADMIN_PASSWORD: password,
      FRIEND_ID_SECRET: "test-only-friend-id-secret-with-32-characters",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  try {
    await waitForServer(origin, child, logs);

    const home = await fetch(`${origin}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /一ノ瀬林檎/);

    const denied = await fetch(`${origin}/admin`, { redirect: "manual" });
    assert.equal(denied.status, 401);
    assert.match(denied.headers.get("www-authenticate") || "", /^Basic /);

    const redirect = await fetch(`${origin}/admin`, {
      headers: { Authorization: authorization },
      redirect: "manual",
    });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get("location"), "/admin/");

    const adminPage = await fetch(`${origin}/admin/`, {
      headers: { Authorization: authorization },
    });
    assert.equal(adminPage.status, 200);

    const gallery = await fetch(`${origin}/api/admin/gallery`, {
      headers: { Authorization: authorization },
    });
    assert.equal(gallery.status, 200);

    const friendCreate = await fetch(`${origin}/api/admin/friends`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ displayName: "测试好友", studentId: "520122" }),
    });
    assert.equal(friendCreate.status, 201);

    const friendLogin = await fetch(`${origin}/api/friend/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({ displayName: "测试好友", studentId: "520122" }),
    });
    assert.equal(friendLogin.status, 200);
    assert.match(friendLogin.headers.get("set-cookie") || "", /roco_friend_session=/);
    const loginBody = await friendLogin.json();
    assert.equal(loginBody.authenticated, true);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => child.once("exit", resolveExit)),
      new Promise((resolveWait) => setTimeout(resolveWait, 3_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
    rmSync(root, { recursive: true, force: true });
  }
});
