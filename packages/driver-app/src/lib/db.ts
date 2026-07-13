import * as SQLite from 'expo-sqlite';

/**
 * Local SQLite database backing the offline outbox. Every mutating action the
 * driver performs (status transitions, location pings, proof-of-delivery) is
 * written here first, then synced to the API when connectivity allows. This is
 * what makes the app offline-first: the UI reads/writes locally and never
 * blocks on the network.
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('marhaba-driver.db').then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS outbox (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          idempotency_key TEXT,
          created_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          status TEXT NOT NULL DEFAULT 'PENDING'
        );
        CREATE INDEX IF NOT EXISTS outbox_status_idx ON outbox(status, created_at);

        CREATE TABLE IF NOT EXISTS cached_orders (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      return db;
    });
  }
  return dbPromise;
}
