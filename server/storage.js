import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, resolve, sep } from "node:path";
import { Readable } from "node:stream";

function ignoreMissing(error) {
  if (error?.code !== "ENOENT") throw error;
}

export class LocalGalleryBucket {
  constructor(root) {
    this.root = resolve(root);
    mkdirSync(this.root, { recursive: true });
  }

  pathFor(key) {
    const normalized = String(key || "").replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    if (
      !normalized
      || normalized.startsWith("/")
      || parts.some((part) => part === "." || part === "..")
    ) {
      throw new Error("图片对象路径无效");
    }
    const path = resolve(this.root, ...parts);
    if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) {
      throw new Error("图片对象路径越界");
    }
    return path;
  }

  metadataPath(path) {
    return `${path}.roco-meta.json`;
  }

  async put(key, value, options = {}) {
    const path = this.pathFor(key);
    mkdirSync(dirname(path), { recursive: true });
    const buffer = Buffer.from(value);
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temporaryPath, buffer, { flag: "wx" });
    renameSync(temporaryPath, path);

    const metadata = {
      contentType: String(options.httpMetadata?.contentType || "application/octet-stream"),
      customMetadata: options.customMetadata || {},
      etag: `"${createHash("sha256").update(buffer).digest("hex")}"`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(this.metadataPath(path), JSON.stringify(metadata, null, 2), "utf8");
  }

  async get(key) {
    const path = this.pathFor(key);
    if (!existsSync(path)) return null;
    const stat = statSync(path);
    if (!stat.isFile()) return null;

    let metadata = {};
    try {
      metadata = JSON.parse(readFileSync(this.metadataPath(path), "utf8"));
    } catch {
      metadata = {};
    }
    const etag = metadata.etag
      || `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const contentType = String(metadata.contentType || "");

    return {
      body: Readable.toWeb(createReadStream(path)),
      size: stat.size,
      etag,
      httpEtag: etag,
      writeHttpMetadata(headers) {
        if (contentType) headers.set("Content-Type", contentType);
        headers.set("Content-Length", String(stat.size));
        headers.set("Last-Modified", stat.mtime.toUTCString());
      },
    };
  }

  async delete(key) {
    const path = this.pathFor(key);
    try {
      unlinkSync(path);
    } catch (error) {
      ignoreMissing(error);
    }
    try {
      unlinkSync(this.metadataPath(path));
    } catch (error) {
      ignoreMissing(error);
    }
  }

  health() {
    mkdirSync(this.root, { recursive: true });
    return statSync(this.root).isDirectory();
  }
}
