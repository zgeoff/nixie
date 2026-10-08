/* oxlint-disable no-await-in-loop -- seeding and export copy one batch after another */
// Operations on a log of 1,000,000 events on both engines: the event-loop block of a full scan,
// backup and restore while 4 processes write, and export to a SQLite file and to JSON Lines.
// Usage: bun ops.ts (needs the nixie-spike-pg container and the sqlite3 CLI).
import { once } from 'node:events';
import { createWriteStream, mkdirSync, rmSync, statSync } from 'node:fs';
import { sql } from 'kysely';
import type { Kind, Store } from './db.ts';
import { createStore, resetTables, setupSchema, toNumber } from './db.ts';

const BATCH = 5000,
  DIR = `${process.cwd()}/results/ops`,
  EVENTS = 1_000_000,
  SQLITE_FILE = `${process.cwd()}/results/ops/ops.db`;

type Report = Record<string, unknown>;

function getElapsedMs(start: number): number {
  return Math.round(performance.now() - start);
}

function toMb(bytes: number): number {
  return Number((bytes / 1e6).toFixed(1));
}

function buildEvents(base: number) {
  return Array.from({ length: BATCH }, (_, j) => ({
    created_at: 1_790_000_000_000 + base + j,
    kind: ['step', 'message', 'tool', 'approval'][(base + j) % 4] ?? 'step',
    payload: JSON.stringify({ text: `message ${base + j} ${'x'.repeat(400)}` }),
    task_id: `task-${(base + j) % 10_000}`,
  }));
}

async function setupEvents(store: Store): Promise<number> {
  const start = performance.now();
  await setupSchema(store);
  await resetTables(store);
  for (let base = 0; base < EVENTS; base += BATCH) {
    await store.db.insertInto('events').values(buildEvents(base)).execute();
  }
  return getElapsedMs(start);
}

async function setupLoadTasks(store: Store): Promise<void> {
  await store.db
    .insertInto('tasks')
    .values(
      Array.from({ length: 100 }, (_, i) => ({
        id: `load-${i}`,
        run_at: 0,
        state: 'runnable' as const,
        steps: 1_000_000,
        updated_at: 0,
      })),
    )
    .execute();
}

async function runScan(store: Store): Promise<number> {
  const start = performance.now();
  await sql`select kind, count(*), sum(length(payload)) from events group by kind`.execute(
    store.db,
  );
  return getElapsedMs(start);
}

// A 5 ms timer on the caller's thread: how long the scan blocks the event loop.
async function readScanLag(store: Store): Promise<Report> {
  const lag = { expected: performance.now() + 5, max: 0 },
    poll = setInterval(() => {
      const t = performance.now();
      lag.max = Math.max(lag.max, t - lag.expected);
      lag.expected = t + 5;
    }, 5),
    queryMs = await runScan(store);
  await Bun.sleep(20);
  clearInterval(poll);
  return { maxLagMs: Math.round(lag.max), queryMs };
}

async function runScans(pg: Store, lite: Store, worker: Store): Promise<Report> {
  await sql`select 1`.execute(worker.db);
  const report = {
    pg: await readScanLag(pg),
    sqliteMainThread: await readScanLag(lite),
    sqliteWorker: await readScanLag(worker),
  };
  await worker.db.destroy();
  return report;
}

function startWriters(kind: Kind): Promise<number>[] {
  return Array.from(
    { length: 4 },
    () =>
      Bun.spawn(['bun', 'load.ts', 'child', '500'], {
        env: { ...process.env, SPIKE_DB: kind, SPIKE_SQLITE_PATH: SQLITE_FILE },
        stdout: 'ignore',
      }).exited,
  );
}

function getBackupPath(method: string): string {
  return `${DIR}/backup-${method}.db`;
}

async function readSqliteFile(path: string): Promise<Report> {
  const query = 'pragma integrity_check; select count(*) from events;',
    text = await Bun.$`sqlite3 ${path} ${query}`.text(),
    [integrity = '', events = '0'] = text.trim().split('\n');
  return { events: Number(events), integrity, sizeMb: toMb(statSync(path).size) };
}

// VACUUM INTO copies through the app's own connection; .backup uses SQLite's online backup API.
async function runBackupCopy(store: Store, method: string): Promise<number> {
  await Bun.sleep(200);
  const start = performance.now(),
    target = getBackupPath(method);
  await (method === 'vacuum-into'
    ? sql`vacuum into ${target}`.execute(store.db)
    : Bun.$`sqlite3 ${SQLITE_FILE} ${`.backup '${target}'`}`.quiet());
  return getElapsedMs(start);
}

async function runSqliteBackup(store: Store, method: string): Promise<Report> {
  const load = startWriters('sqlite'),
    ms = await runBackupCopy(store, method),
    verify = await readSqliteFile(getBackupPath(method)),
    writersExitCodes = await Promise.all(load);
  return { ms, ...verify, writersExitCodes };
}

async function runPsql(database: string, query: string): Promise<string> {
  const text =
    await Bun.$`docker exec nixie-spike-pg psql -U spike -d ${database} -tAc ${query}`.text();
  return text.trim();
}

async function runDumpCopy(): Promise<number> {
  await Bun.sleep(200);
  const start = performance.now();
  await Bun.$`docker exec nixie-spike-pg pg_dump -U spike -Fc -f /tmp/spike.dump spike`.quiet();
  return getElapsedMs(start);
}

async function runPgDump(): Promise<Report> {
  const load = startWriters('pg'),
    ms = await runDumpCopy(),
    size = await Bun.$`docker exec nixie-spike-pg stat -c %s /tmp/spike.dump`.text();
  await Promise.all(load);
  return { dumpMs: ms, dumpSizeMb: toMb(Number(size.trim())) };
}

async function runRestoreCopy(): Promise<number> {
  const start = performance.now();
  await Bun.$`docker exec nixie-spike-pg pg_restore -U spike -d restored /tmp/spike.dump`.quiet();
  return getElapsedMs(start);
}

async function runPgRestore(): Promise<Report> {
  await runPsql('spike', 'drop database if exists restored');
  await runPsql('spike', 'create database restored');
  const ms = await runRestoreCopy(),
    rows = await runPsql('restored', 'select count(*) from events');
  return { restoreMs: ms, restoredEvents: Number(rows) };
}

async function writeBatch(pg: Store, target: Store, lastId: number): Promise<number | undefined> {
  const rows = await pg.db
    .selectFrom('events')
    .selectAll()
    .where('id', '>', lastId)
    .orderBy('id')
    .limit(BATCH)
    .execute();
  if (rows.length === 0) {
    return undefined;
  }
  await target.db
    .insertInto('events')
    .values(rows.map((r) => ({ ...r, created_at: toNumber(r.created_at), id: toNumber(r.id) })))
    .execute();
  return toNumber(rows.at(-1)?.id);
}

async function writeAllEvents(pg: Store): Promise<void> {
  const cursor: { lastId: number | undefined } = { lastId: 0 },
    target = createStore('sqlite');
  await setupSchema(target);
  while (cursor.lastId !== undefined) {
    cursor.lastId = await writeBatch(pg, target, cursor.lastId);
  }
  await target.db.destroy();
}

// The same Kysely schema on both engines makes the Postgres to SQLite export a batched copy.
async function runExportToSqlite(pg: Store): Promise<Report> {
  const file = `${DIR}/export-from-pg.db`,
    start = performance.now();
  process.env.SPIKE_SQLITE_PATH = file;
  await writeAllEvents(pg);
  return { ms: getElapsedMs(start), sizeMb: toMb(statSync(file).size) };
}

async function runExportToJsonl(lite: Store): Promise<Report> {
  const cursor = { lastId: 0 },
    file = `${DIR}/export.jsonl`,
    start = performance.now(),
    stream = createWriteStream(file);
  for (;;) {
    const rows = await lite.db
      .selectFrom('events')
      .selectAll()
      .where('id', '>', cursor.lastId)
      .orderBy('id')
      .limit(BATCH)
      .execute();
    if (rows.length === 0) {
      break;
    }
    stream.write(`${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
    cursor.lastId = toNumber(rows.at(-1)?.id);
  }
  stream.end();
  await once(stream, 'finish');
  return { ms: getElapsedMs(start), sizeMb: toMb(statSync(file).size) };
}

async function readSizes(pg: Store): Promise<Report> {
  await sql`vacuum analyze events`.execute(pg.db);
  const size = await runPsql('spike', 'select pg_database_size(current_database())');
  return { pg: toMb(Number(size)), sqlite: toMb(statSync(SQLITE_FILE).size) };
}

async function runOps(pg: Store, lite: Store, report: Report): Promise<void> {
  report.seedMs = { pg: await setupEvents(pg), sqlite: await setupEvents(lite) };
  await sql`pragma wal_checkpoint(truncate)`.execute(lite.db);
  report.sizeMb = await readSizes(pg);
  report.heavyRead = await runScans(pg, lite, createStore('sqlite-worker'));
  await setupLoadTasks(lite);
  await setupLoadTasks(pg);
  report.sqliteBackup = {
    backupApi: await runSqliteBackup(lite, 'backup-api'),
    vacuumInto: await runSqliteBackup(lite, 'vacuum-into'),
  };
  report.pgBackup = { ...(await runPgDump()), ...(await runPgRestore()) };
  report.exportPgToSqlite = await runExportToSqlite(pg);
  report.exportSqliteToJsonl = await runExportToJsonl(lite);
}

async function runMain(): Promise<void> {
  rmSync(DIR, { force: true, recursive: true });
  mkdirSync(DIR, { recursive: true });
  process.env.SPIKE_SQLITE_PATH = SQLITE_FILE;
  const lite = createStore('sqlite'),
    pg = createStore('pg'),
    report: Report = {};
  await runOps(pg, lite, report);
  console.log(JSON.stringify(report, null, 2));
  await pg.db.destroy();
  await lite.db.destroy();
}

await runMain();
