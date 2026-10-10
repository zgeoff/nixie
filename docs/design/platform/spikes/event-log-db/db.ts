/* oxlint-disable no-await-in-loop -- schema statements and pragmas run in order on one connection */
// The event log core on both engines: one Kysely schema, one connection factory, and the
// transaction helper that differs per engine. Env: SPIKE_DB (pg, sqlite or sqlite-worker),
// SPIKE_PG_URL, SPIKE_SQLITE_PATH, SPIKE_SQLITE_SYNC (NORMAL or FULL).
import { SQL } from 'bun';
import type { DatabaseConnection, Generated, Transaction } from 'kysely';
import { CompiledQuery, Kysely, sql } from 'kysely';
import { BunWorkerDialect } from 'kysely-bun-worker';
import { BunSqliteDialect } from 'kysely-bun-worker/normal';
import { PostgresJSDialect } from 'kysely-postgres-js';

export type Kind = 'pg' | 'sqlite' | 'sqlite-worker';

// Times are epoch milliseconds in a bigint column on both engines.
export interface EventRow {
  id: Generated<number>;
  task_id: string;
  kind: string;
  step: number | null;
  epoch: number | null;
  worker: string | null;
  payload: string;
  created_at: number;
}

export interface TaskRow {
  id: string;
  state: 'runnable' | 'done';
  step: Generated<number>;
  steps: number;
  run_at: number;
  lease_owner: string | null;
  lease_expires_at: number | null;
  lease_epoch: Generated<number>;
  updated_at: number;
}

export interface ApprovalRow {
  id: string;
  action_hash: string;
  status: 'pending' | 'consumed';
  consumed_by: string | null;
  consumed_at: number | null;
  expires_at: number;
}

export interface JobRow {
  id: string;
  task_id: string;
  approval_id: string | null;
  action: string;
  idempotency_key: string | null;
  status: 'pending' | 'running' | 'done' | 'failed' | 'unknown';
  attempts: Generated<number>;
  lease_owner: string | null;
  lease_expires_at: number | null;
  lease_epoch: Generated<number>;
  updated_at: number;
}

// An audit row per claim, with no unique constraint, so a double claim shows up in the check.
export interface ClaimRow {
  id: Generated<number>;
  kind: 'task' | 'job';
  ref_id: string;
  epoch: number;
  step: number;
  worker: string;
  claimed_at: number;
  expires_at: number;
}

export interface Schema {
  events: EventRow;
  tasks: TaskRow;
  approvals: ApprovalRow;
  jobs: JobRow;
  claims: ClaimRow;
}

export type Db = Kysely<Schema>;
export type Tx = Kysely<Schema> | Transaction<Schema>;
export type TxMode = 'immediate' | 'deferred';

// A database handle together with the engine behind it.
export interface Store {
  db: Db;
  kind: Kind;
}

export const PG_URL = process.env.SPIKE_PG_URL ?? 'postgres://spike:spike@localhost:55432/spike';

export function readKind(): Kind {
  const kind = process.env.SPIKE_DB ?? 'sqlite';
  if (kind !== 'pg' && kind !== 'sqlite' && kind !== 'sqlite-worker') {
    throw new Error(`SPIKE_DB must be pg, sqlite or sqlite-worker, not ${kind}`);
  }
  return kind;
}

export function getSqlitePath(): string {
  return process.env.SPIKE_SQLITE_PATH ?? 'results/spike.db';
}

function readPragmas(): string[] {
  return [
    'pragma journal_mode = wal',
    `pragma synchronous = ${process.env.SPIKE_SQLITE_SYNC ?? 'NORMAL'}`,
    'pragma busy_timeout = 10000',
    'pragma foreign_keys = on',
  ];
}

async function setupSqliteConnection(conn: DatabaseConnection): Promise<void> {
  for (const pragma of readPragmas()) {
    await conn.executeQuery(CompiledQuery.raw(pragma));
  }
}

function createDb(kind: Kind, poolSize: number): Db {
  if (kind === 'pg') {
    return new Kysely<Schema>({
      dialect: new PostgresJSDialect({ postgres: new SQL({ max: poolSize, url: PG_URL }) }),
    });
  }
  const config = { onCreateConnection: setupSqliteConnection, url: getSqlitePath() };
  if (kind === 'sqlite') {
    return new Kysely<Schema>({ dialect: new BunSqliteDialect(config) });
  }
  return new Kysely<Schema>({ dialect: new BunWorkerDialect(config) });
}

export function createStore(kind: Kind, poolSize = 4): Store {
  return { db: createDb(kind, poolSize), kind };
}

// SQLite takes the write lock at BEGIN IMMEDIATE, so busy_timeout queues the writer. Kysely's
// SQLite dialects issue a plain BEGIN, which fails with SQLITE_BUSY when a read in the same
// transaction saw an older snapshot.
function runImmediate<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.connection().execute(async (conn) => {
    await sql`begin immediate`.execute(conn);
    try {
      const result = await fn(conn);
      await sql`commit`.execute(conn);
      return result;
    } catch (error) {
      await sql`rollback`.execute(conn);
      throw error;
    }
  });
}

// Runs fn in one write transaction. Postgres uses Kysely's transaction at READ COMMITTED.
export function writeTx<T>(store: Store, fn: (tx: Tx) => Promise<T>, mode?: TxMode): Promise<T> {
  if (store.kind === 'pg' || mode === 'deferred') {
    return store.db.transaction().execute(fn);
  }
  return runImmediate(store.db, fn);
}

export async function setupSchema(store: Store): Promise<void> {
  const id = store.kind === 'pg' ? 'bigserial primary key' : 'integer primary key autoincrement',
    statements = [
      `create table if not exists events (id ${id}, task_id text not null, kind text not null,
        step integer, epoch integer, worker text, payload text not null, created_at bigint not null)`,
      'create index if not exists events_task on events (task_id, id)',
      `create table if not exists tasks (id text primary key, state text not null,
        step integer not null default 0, steps integer not null, run_at bigint not null,
        lease_owner text, lease_expires_at bigint, lease_epoch integer not null default 0,
        updated_at bigint not null)`,
      'create index if not exists tasks_ready on tasks (state, run_at)',
      `create table if not exists approvals (id text primary key, action_hash text not null,
        status text not null, consumed_by text, consumed_at bigint, expires_at bigint not null)`,
      `create table if not exists jobs (id text primary key, task_id text not null,
        approval_id text references approvals (id), action text not null, idempotency_key text,
        status text not null, attempts integer not null default 0, lease_owner text,
        lease_expires_at bigint, lease_epoch integer not null default 0, updated_at bigint not null)`,
      'create index if not exists jobs_ready on jobs (status, lease_expires_at)',
      `create table if not exists claims (id ${id}, kind text not null, ref_id text not null,
        epoch integer not null, step integer not null, worker text not null,
        claimed_at bigint not null, expires_at bigint not null)`,
    ];
  for (const statement of statements) {
    await sql.raw(statement).execute(store.db);
  }
}

export async function resetTables(store: Store): Promise<void> {
  for (const table of ['claims', 'jobs', 'approvals', 'events', 'tasks']) {
    await sql.raw(`delete from ${table}`).execute(store.db);
  }
}

// Bun.SQL returns int8 as a string; both engines read numbers back through this.
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return Number.NaN;
  }
  return Number(value);
}
