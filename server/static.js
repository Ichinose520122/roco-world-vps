import { readFileSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
]);

function resolvePublicPath(publicDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { error: 400 };
  }

  if (decoded === "/") decoded = "/index.html";
  if (decoded === "/admin/") decoded = "/admin/index.html";
  if (decoded.endsWith("/") || decoded.includes("\0")) return { error: 404 };

  const parts = decoded.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) return { error: 403 };
  if (parts.at(-1) === "_routes.json") return { error: 404 };

  const path = resolve(publicDir, ...parts);
  if (path !== publicDir && !path.startsWith(`${publicDir}${sep}`)) return { error: 403 };
  return { path };
}

function headersFor(path, stat) {
  const extension = extname(path).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  return {
    "Content-Type": MIME_TYPES.get(extension) || "application/octet-stream",
    "Content-Length": String(stat.size),
    "Last-Modified": stat.mtime.toUTCString(),
    ETag: etag,
    "Cache-Control": extension === ".html"
      ? "no-cache"
      : "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

export function serveStatic(request, publicDir) {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const pathname = new URL(request.url).pathname;
  const resolved = resolvePublicPath(publicDir, pathname);
  if (resolved.error) {
    return new Response("Not found", { status: resolved.error });
  }

  let stat;
  try {
    stat = statSync(resolved.path);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!stat.isFile()) return new Response("Not found", { status: 404 });

  const headers = headersFor(resolved.path, stat);
  if (request.headers.get("If-None-Match") === headers.ETag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: headers.ETag, "Cache-Control": headers["Cache-Control"] },
    });
  }

  return new Response(request.method === "HEAD" ? null : readFileSync(resolved.path), {
    status: 200,
    headers,
  });
}
