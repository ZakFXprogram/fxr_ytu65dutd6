import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { CONFIG, type AppConfig } from '../config';

/**
 * Thin SQLite layer (node:sqlite, no native build). One file on the Railway volume. WAL mode so a reader
 * never blocks a writer. All access goes through typed helpers; statements are always parameterised.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private db!: DatabaseSync;

  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {}

  onModuleInit(): void {
    mkdirSync(this.cfg.dataDir, { recursive: true });
    this.db = new DatabaseSync(join(this.cfg.dataDir, 'fxr.sqlite'));
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  onModuleDestroy(): void {
    try {
      this.db.close();
    } catch {
      /* already closed */
    }
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS licences (
        id TEXT PRIMARY KEY,
        user_ref TEXT NOT NULL,
        plan TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        machine_id TEXT,
        order_id TEXT,
        last_seen_ms INTEGER,
        created_ms INTEGER NOT NULL,
        updated_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lic_user ON licences(user_ref);
      CREATE INDEX IF NOT EXISTS idx_lic_status ON licences(status);

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts_ms INTEGER NOT NULL,
        kind TEXT NOT NULL,
        text TEXT NOT NULL
      );

      -- Customers and admins, identified only by their Discord account (no password, no e-mail stored).
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,               -- Discord user id
        username TEXT NOT NULL,
        display_name TEXT,
        avatar TEXT,                       -- Discord avatar hash
        banned INTEGER NOT NULL DEFAULT 0,
        created_ms INTEGER NOT NULL,
        last_login_ms INTEGER NOT NULL
      );

      -- Server-side sessions: the cookie holds a random 256-bit id, the table only its SHA-256.
      CREATE TABLE IF NOT EXISTS sessions (
        id_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        admin INTEGER NOT NULL DEFAULT 0,
        created_ms INTEGER NOT NULL,
        expires_ms INTEGER NOT NULL,
        last_seen_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sess_user ON sessions(user_id);

      -- USDT orders. txid is UNIQUE so one payment can never be claimed twice.
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        plan TEXT NOT NULL,
        amount TEXT NOT NULL,
        pay_to TEXT NOT NULL,
        status TEXT NOT NULL,
        txid TEXT UNIQUE,
        licence_id TEXT,
        note TEXT,
        decided_by TEXT,
        created_ms INTEGER NOT NULL,
        expires_ms INTEGER NOT NULL,
        submitted_ms INTEGER,
        decided_ms INTEGER,
        updated_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    `);
    // columns added after the first release
    this.addColumn('licences', 'key_set_ms', 'INTEGER');
    this.addColumn('licences', 'machine_moved_ms', 'INTEGER');
  }

  private addColumn(table: string, column: string, type: string): void {
    const cols = this.all<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!cols.some((c) => c.name === column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }

  /** Runs fn inside a transaction (all or nothing). */
  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  get handle(): DatabaseSync {
    return this.db;
  }

  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }

  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
    return this.db.prepare(sql).get(...(params as never[])) as T | undefined;
  }

  run(sql: string, ...params: unknown[]): number {
    return Number(this.db.prepare(sql).run(...(params as never[])).changes);
  }

  logEvent(kind: string, text: string): void {
    this.run('INSERT INTO events(ts_ms, kind, text) VALUES (?,?,?)', Date.now(), kind, text);
  }

  recentEvents(limit = 50): { ts_ms: number; kind: string; text: string }[] {
    return this.all('SELECT ts_ms, kind, text FROM events ORDER BY id DESC LIMIT ?', limit);
  }
}

export function newId(): string {
  return randomBytes(12).toString('hex');
}
