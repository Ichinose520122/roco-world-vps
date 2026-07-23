import { createHash, timingSafeEqual } from "node:crypto";

function digest(value) {
  return createHash("sha256").update(String(value)).digest();
}

function sameSecret(left, right) {
  return timingSafeEqual(digest(left), digest(right));
}

export function authenticateBasic(request, config) {
  if (config.adminPassword.length < 16) {
    return new Response("管理后台尚未配置：请在 .env 设置至少 16 位的 ADMIN_PASSWORD", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const authorization = request.headers.get("Authorization") || "";
  if (authorization.startsWith("Basic ")) {
    try {
      const plain = Buffer.from(authorization.slice(6), "base64").toString("utf8");
      const separator = plain.indexOf(":");
      const username = separator >= 0 ? plain.slice(0, separator) : "";
      const password = separator >= 0 ? plain.slice(separator + 1) : "";
      if (
        sameSecret(username, config.adminUsername)
        && sameSecret(password, config.adminPassword)
      ) {
        return null;
      }
    } catch {
      // Fall through to the authentication challenge.
    }
  }

  return new Response("需要管理员身份", {
    status: 401,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "WWW-Authenticate": 'Basic realm="Roco Gallery Admin", charset="UTF-8"',
    },
  });
}
