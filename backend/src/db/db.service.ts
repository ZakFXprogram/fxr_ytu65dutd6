import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { CONFIG, type AppConfig } from '../config';

export interface EventRow {
  id: number;
  ts_ms: number;
  kind: string;
  text: string;
  user_id: string | null;
}

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
    this.db.exec('PRAGMA busy_timeout = 3000;');
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

      -- Orders. Paid in USDT (TRC20) straight to the owner's address; matched from the blockchain (see orders.service).
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        plan TEXT NOT NULL,
        amount TEXT NOT NULL,
        pay_to TEXT NOT NULL DEFAULT '',
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

      -- Redeem keys: single-use activation codes (giveaways, resellers). Stored hashed; the last 4 chars help
      -- the owner recognise one.
      CREATE TABLE IF NOT EXISTS codes (
        id TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL UNIQUE,
        hint TEXT NOT NULL,
        plan TEXT NOT NULL,
        days INTEGER NOT NULL,
        status TEXT NOT NULL,              -- unused | used | disabled
        batch TEXT,
        created_by TEXT NOT NULL,
        created_ms INTEGER NOT NULL,
        used_by TEXT,
        used_ms INTEGER,
        licence_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_codes_status ON codes(status);
    `);
    // columns added after the first release
    this.addColumn('licences', 'key_set_ms', 'INTEGER');
    this.addColumn('licences', 'machine_moved_ms', 'INTEGER');
    this.addColumn('events', 'user_id', 'TEXT');
    this.addColumn('sessions', 'device', 'TEXT');
    this.addColumn('users', 'role_state', 'INTEGER NOT NULL DEFAULT 0'); // 1 = we gave the Discord role
    this.addColumn('users', 'in_guild', 'INTEGER'); // null unknown, 0 not in server, 1 in server
    this.addColumn('orders', 'invoice_id', 'TEXT');
    this.addColumn('orders', 'invoice_url', 'TEXT');
    this.addColumn('orders', 'payment_id', 'TEXT');
    this.addColumn('orders', 'pay_currency', 'TEXT');
    this.addColumn('orders', 'paid_amount', 'TEXT');
    this.addColumn('orders', 'provider_status', 'TEXT');
    this.addColumn('orders', 'terms_ms', 'INTEGER'); // when the buyer accepted the Terms and the risk disclosure
    // direct TRON payments
    this.addColumn('orders', 'base_micro', 'INTEGER'); // plan price in micro-USDT
    this.addColumn('orders', 'amount_micro', 'INTEGER'); // exact amount asked: price + a unique 0.0001-0.0999
    this.addColumn('orders', 'claimed_txid', 'TEXT'); // transaction id the buyer gave us (exchanges)
    this.addColumn('orders', 'claim_ms', 'INTEGER');
    this.addColumn('orders', 'paid_micro', 'INTEGER'); // what actually arrived
    this.addColumn('orders', 'payer', 'TEXT'); // sending address (public)
    this.addColumn('orders', 'paid_tx_ms', 'INTEGER'); // block time of the payment
    this.db.exec(`
      -- Every confirmed USDT transfer that reached the receiving address, matched to an order or waiting for the owner.
      CREATE TABLE IF NOT EXISTS chain_transfers (
        txid TEXT PRIMARY KEY,
        from_addr TEXT,
        value_micro INTEGER NOT NULL,
        block_ms INTEGER NOT NULL,
        status TEXT NOT NULL,              -- matched | unmatched | ignored
        order_id TEXT,
        note TEXT,
        seen_ms INTEGER NOT NULL,
        decided_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ct_status ON chain_transfers(status);
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_orders_amount ON orders(amount_micro);
      CREATE INDEX IF NOT EXISTS idx_orders_claim ON orders(claimed_txid);
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_ms)');
  }

  private addColumn(table: string, column: string, type: string): void {
    const cols = this.all<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!cols.some((c) => c.name === column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }

  /** Runs fn inside a transaction (all or nothing). Nested calls join the outer transaction. */
  private depth = 0;
  tx<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    this.depth++;
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    } finally {
      this.depth--;
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

  logEvent(kind: string, text: string, userId: string | null = null): void {
    this.run('INSERT INTO events(ts_ms, kind, text, user_id) VALUES (?,?,?,?)', Date.now(), kind, text, userId);
  }

  getMeta(k: string): string | null {
    return this.get<{ v: string }>('SELECT v FROM meta WHERE k = ?', k)?.v ?? null;
  }

  setMeta(k: string, v: string): void {
    this.run('INSERT INTO meta(k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, v);
  }

  recentEvents(limit = 50): EventRow[] {
    return this.all('SELECT * FROM events ORDER BY id DESC LIMIT ?', limit);
  }
}

export function newId(): string {
  return randomBytes(12).toString('hex');
}
