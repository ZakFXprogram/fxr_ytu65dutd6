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
    `);
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

  run(sql: string, ...params: unknown[]): void {
    this.db.prepare(sql).run(...(params as never[]));
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
