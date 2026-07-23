function cacheKey(input) {
  if (typeof input === "string") return input;
  return `${input.method || "GET"} ${input.url}`;
}

function maxAge(headers) {
  const value = headers.get("CDN-Cache-Control")
    || headers.get("Cache-Control")
    || "";
  const match = /(?:s-maxage|max-age)=(\d+)/i.exec(value);
  return match ? Number(match[1]) : 0;
}

export class MemoryCache {
  constructor({ maxBytes, maxObjectBytes }) {
    this.maxBytes = Math.max(0, Number(maxBytes || 0));
    this.maxObjectBytes = Math.max(0, Number(maxObjectBytes || 0));
    this.currentBytes = 0;
    this.items = new Map();
  }

  async match(input) {
    const key = cacheKey(input);
    const item = this.items.get(key);
    if (!item) return undefined;
    if (item.expiresAt <= Date.now()) {
      this.remove(key);
      return undefined;
    }
    this.items.delete(key);
    this.items.set(key, item);
    return new Response(item.body, {
      status: item.status,
      statusText: item.statusText,
      headers: item.headers,
    });
  }

  async put(input, response) {
    if (!this.maxBytes || response.status !== 200) return;
    const declaredSize = Number(response.headers.get("Content-Length") || 0);
    if (this.maxObjectBytes && declaredSize > this.maxObjectBytes) return;

    const body = Buffer.from(await response.arrayBuffer());
    if (this.maxObjectBytes && body.length > this.maxObjectBytes) return;
    if (body.length > this.maxBytes) return;

    const ttl = maxAge(response.headers);
    if (ttl <= 0) return;
    const key = cacheKey(input);
    this.remove(key);
    const item = {
      body,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
      expiresAt: Date.now() + ttl * 1000,
      size: body.length,
    };
    this.items.set(key, item);
    this.currentBytes += item.size;
    this.trim();
  }

  async delete(input) {
    return this.remove(cacheKey(input));
  }

  remove(key) {
    const item = this.items.get(key);
    if (!item) return false;
    this.items.delete(key);
    this.currentBytes -= item.size;
    return true;
  }

  trim() {
    while (this.currentBytes > this.maxBytes && this.items.size) {
      const oldestKey = this.items.keys().next().value;
      this.remove(oldestKey);
    }
  }
}

export function installCache(options) {
  const cache = new MemoryCache(options);
  globalThis.caches = { default: cache };
  return cache;
}
