/* oxlint-disable typescript/no-non-null-assertion, one-var -- required schema rows and separate transaction checkpoints */
import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { checkWrite } from '../memory-checks/checks.ts';
import type { Span } from '../memory-checks/checks.ts';

export interface Message {
  at: number;
  id: number;
  readable: number;
  role: 'owner' | 'reply' | 'summary';
  spans: string;
  text: string;
}

export interface Candidate {
  memory: string;
  quote: string;
  source: number;
}

export interface Batch {
  end: number;
  key: string;
  start: number;
}

export function createStore(path: string): Database {
  const db = new Database(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY, at INTEGER NOT NULL, role TEXT NOT NULL,
      text TEXT NOT NULL, spans TEXT NOT NULL, readable INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS state (
      id INTEGER PRIMARY KEY CHECK(id = 1), cursor INTEGER NOT NULL, session TEXT NOT NULL
    );
    INSERT OR IGNORE INTO state VALUES (1, 0, 'old-session');
    CREATE TABLE IF NOT EXISTS batches (
      key TEXT PRIMARY KEY, start INTEGER NOT NULL, end INTEGER NOT NULL,
      status TEXT NOT NULL, session TEXT
    );
    CREATE TABLE IF NOT EXISTS proposals (
      receipt TEXT PRIMARY KEY, batch TEXT NOT NULL, source INTEGER NOT NULL,
      quote TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL
    );
  `);
  return db;
}

export function writeMessage(db: Database, message: Message): void {
  db.query('INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?)').run(
    message.id,
    message.at,
    message.role,
    message.text,
    message.spans,
    message.readable,
  );
}

export function getCursor(db: Database): number {
  return db.query<{ cursor: number }, []>('SELECT cursor FROM state').get()!.cursor;
}

// Select a fixed upper bound in a short transaction. Later arrivals belong to the next batch.
export function createBatch(db: Database): Batch | null {
  return db
    .transaction(() => {
      const pending = db
        .query<Batch, []>(
          "SELECT key, start, end FROM batches WHERE status = 'pending' ORDER BY start LIMIT 1",
        )
        .get();
      if (pending) {
        return pending;
      }
      const start = getCursor(db);
      const end = db
        .query<{ end: number }, []>('SELECT COALESCE(MAX(id), 0) AS end FROM messages')
        .get()!.end;
      if (start === end) {
        return null;
      }
      const batch = { end, key: `${start}:${end}`, start };
      db.query('INSERT INTO batches VALUES (?, ?, ?, ?, NULL)').run(
        batch.key,
        start,
        end,
        'pending',
      );
      return batch;
    })
    .immediate();
}

// The trigger values are experiment settings, not agreed product defaults.
export function getTrigger(db: Database, now: number): string | null {
  const messages = db
    .query<Message, [number]>("SELECT * FROM messages WHERE id > ? AND role = 'owner' ORDER BY id")
    .all(getCursor(db));
  if (messages.length === 0) {
    return null;
  }
  if (messages.length >= 4) {
    return 'count';
  }
  if (now - messages[0]!.at >= 20 * 60_000) {
    return 'age';
  }
  const latest = db.query<{ at: number }, []>('SELECT MAX(at) AS at FROM messages').get()!.at;
  return now - latest >= 5 * 60_000 ? 'idle' : null;
}

export function checkCandidate(db: Database, batch: Batch, candidate: Candidate): boolean {
  if (candidate.source <= batch.start || candidate.source > batch.end) {
    return false;
  }
  const message = db
    .query<Message, [number]>('SELECT * FROM messages WHERE id = ?')
    .get(candidate.source);
  if (!message || message.role !== 'owner' || !message.readable) {
    return false;
  }
  return checkWrite({ spans: JSON.parse(message.spans) as Span[], text: message.text }, candidate)
    .ok;
}

export function getReceipt(batch: Batch, candidate: Candidate): string {
  return createHash('sha256')
    .update(JSON.stringify([batch.key, candidate]))
    .digest('hex');
}
