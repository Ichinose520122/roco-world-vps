const ROUTE_SPECS = [
  ["/api/gallery", () => import("../functions/api/gallery.js")],
  ["/api/friend/session", () => import("../functions/api/friend/session.js")],
  ["/api/comments/:imageId", () => import("../functions/api/comments/[imageId].js")],
  ["/gallery/:id", () => import("../functions/gallery/[id].js")],

  ["/api/admin/gallery", () => import("../functions/api/admin/gallery.js")],
  ["/api/admin/gallery/:id", () => import("../functions/api/admin/gallery/[id].js")],
  ["/api/admin/upload", () => import("../functions/api/admin/upload.js")],
  ["/api/admin/snapshot", () => import("../functions/api/admin/snapshot.js")],
  ["/api/admin/export", () => import("../functions/api/admin/export.js")],
  ["/api/admin/import", () => import("../functions/api/admin/import.js")],
  ["/api/admin/bulk", () => import("../functions/api/admin/bulk.js")],
  ["/api/admin/move-category", () => import("../functions/api/admin/move-category.js")],
  ["/api/admin/site-settings", () => import("../functions/api/admin/site-settings.js")],
  ["/api/admin/category-order", () => import("../functions/api/admin/category-order.js")],
  ["/api/admin/category-settings", () => import("../functions/api/admin/category-settings.js")],
  ["/api/admin/categories", () => import("../functions/api/admin/categories.js")],
  ["/api/admin/categories/:id", () => import("../functions/api/admin/categories/[id].js")],
  ["/api/admin/comments", () => import("../functions/api/admin/comments.js")],
  ["/api/admin/comments/:id", () => import("../functions/api/admin/comments/[id].js")],
  ["/api/admin/friends", () => import("../functions/api/admin/friends.js")],
  ["/api/admin/friends/:id", () => import("../functions/api/admin/friends/[id].js")],
];

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilePath(path) {
  const names = [];
  const parts = path.split("/").map((part) => {
    if (!part.startsWith(":")) return escapePattern(part);
    names.push(part.slice(1));
    return "([^/]+)";
  });
  return {
    names,
    pattern: new RegExp(`^${parts.join("/")}/?$`),
  };
}

function handlerName(method) {
  const normalized = method === "HEAD" ? "GET" : method;
  return `onRequest${normalized.charAt(0)}${normalized.slice(1).toLowerCase()}`;
}

function allowedMethods(module) {
  return Object.keys(module)
    .filter((name) => /^onRequest(?:Get|Post|Patch|Put|Delete)$/.test(name))
    .map((name) => name.slice("onRequest".length).toUpperCase());
}

export async function createRouter() {
  const routes = await Promise.all(ROUTE_SPECS.map(async ([path, loader]) => ({
    path,
    ...compilePath(path),
    module: await loader(),
  })));

  return {
    async dispatch(request, env) {
      const pathname = new URL(request.url).pathname;
      for (const route of routes) {
        const match = route.pattern.exec(pathname);
        if (!match) continue;

        const handler = route.module[handlerName(request.method)];
        if (!handler) {
          const allow = allowedMethods(route.module);
          return new Response("Method not allowed", {
            status: 405,
            headers: {
              Allow: allow.join(", "),
              "Content-Type": "text/plain; charset=utf-8",
            },
          });
        }

        const params = {};
        try {
          route.names.forEach((name, index) => {
            params[name] = decodeURIComponent(match[index + 1]);
          });
        } catch {
          return new Response("Invalid URL parameter", { status: 400 });
        }

        const pending = new Set();
        const context = {
          request,
          env,
          params,
          data: {},
          waitUntil(promise) {
            const tracked = Promise.resolve(promise)
              .catch((error) => console.error("Background task failed", error))
              .finally(() => pending.delete(tracked));
            pending.add(tracked);
          },
        };

        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new TypeError(`${route.path} 没有返回有效的 Response`);
        }
        return response;
      }
      return null;
    },
  };
}
