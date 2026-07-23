import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

function normalizeParameter(value) {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function resultMeta(result = {}) {
  return {
    changes: Number(result.changes || 0),
    last_row_id: Number(result.lastInsertRowid || 0),
  };
}

class D1PreparedStatement {
  constructor(owner, sql, parameters = []) {
    this.owner = owner;
    this.sql = String(sql);
    this.parameters = parameters;
  }

  bind(...parameters) {
    return new D1PreparedStatement(
      this.owner,
      this.sql,
      parameters.map(normalizeParameter),
    );
  }

  statement() {
    return this.owner.raw.prepare(this.sql);
  }

  async first() {
    return this.statement().get(...this.parameters) ?? null;
  }

  async all() {
    const results = this.statement().all(...this.parameters);
    return {
      success: true,
      results,
      meta: { changes: 0 },
    };
  }

  async run() {
    const result = this.statement().run(...this.parameters);
    return {
      success: true,
      meta: resultMeta(result),
    };
  }

  executeForBatch() {
    const statement = this.statement();
    const isReader = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(this.sql);
    if (isReader) {
      return {
        success: true,
        results: statement.all(...this.parameters),
        meta: { changes: 0 },
      };
    }
    const result = statement.run(...this.parameters);
    return {
      success: true,
      meta: resultMeta(result),
    };
  }
}

export class D1Database {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true });
    this.path = path;
    this.raw = new DatabaseSync(path);
    this.raw.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA temp_store = MEMORY;
    `);
  }

  prepare(sql) {
    return new D1PreparedStatement(this, sql);
  }

  async batch(statements) {
    this.raw.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => {
        if (!(statement instanceof D1PreparedStatement) || statement.owner !== this) {
          throw new TypeError("DB.batch 仅接受当前数据库创建的预处理语句");
        }
        return statement.executeForBatch();
      });
      this.raw.exec("COMMIT");
      return results;
    } catch (error) {
      try {
        this.raw.exec("ROLLBACK");
      } catch {
        // Ignore rollback errors; the original exception is more useful.
      }
      throw error;
    }
  }

  health() {
    return this.raw.prepare("SELECT 1 AS ok").get()?.ok === 1;
  }

  close() {
    this.raw.close();
  }
}
