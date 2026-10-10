/* oxlint-disable no-await-in-loop -- each child runs its transactions one after another */
// A read-modify-write transaction raced by 8 processes, 200 rounds each, reading a counter and
// writing it back plus one. Usage: bun rmw.ts <immediate|deferred|for-update> [child <start_at>]
import { sql } from 'kysely';
import type { Store } from './db.ts';
import { createStore, readKind, setupSchema, toNumber, writeTx } from './db.ts';

const PROCS = 8,
  ROUNDS = 200;

interface ChildResult {
  ok: number;
  errors: Record<string, number>;
}

// `for-update` adds FOR UPDATE to the read on Postgres; SQLite has no row locks to take.
async function runIncrement(store: Store, mode: string): Promise<void> {
  const lock = mode === 'for-update' && store.kind === 'pg' ? sql` for update` : sql``,
    txMode = mode === 'deferred' ? 'deferred' : 'immediate';
  await writeTx(
    store,
    async (tx) => {
      const row = await sql<{
          value: number;
        }>`select value from tasks_counter where id = 1${lock}`.execute(tx),
        value = toNumber(row.rows[0]?.value) + 1;
      await sql`update tasks_counter set value = ${value} where id = 1`.execute(tx);
    },
    txMode,
  );
}

async function runChild(mode: string, startAt: number): Promise<void> {
  const result: ChildResult = { errors: {}, ok: 0 },
    store = createStore(readKind(), 1);
  await Bun.sleep(Math.max(0, startAt - Date.now()));
  for (let i = 0; i < ROUNDS; i++) {
    try {
      await runIncrement(store, mode);
      result.ok += 1;
    } catch (error) {
      const key = String(error).slice(0, 80);
      result.errors[key] = (result.errors[key] ?? 0) + 1;
    }
  }
  console.log(JSON.stringify(result));
  await store.db.destroy();
}

async function setupCounter(store: Store): Promise<void> {
  await setupSchema(store);
  await sql`create table if not exists tasks_counter (id integer primary key, value integer)`.execute(
    store.db,
  );
  await sql`delete from tasks_counter`.execute(store.db);
  await sql`insert into tasks_counter (id, value) values (1, 0)`.execute(store.db);
}

async function readChild(mode: string, startAt: number): Promise<ChildResult> {
  const child = Bun.spawn(['bun', 'rmw.ts', mode, 'child', String(startAt)], {
      env: process.env,
      stdout: 'pipe',
    }),
    text = await new Response(child.stdout).text();
  return JSON.parse(text);
}

function mergeErrors(results: ChildResult[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const result of results) {
    for (const [key, n] of Object.entries(result.errors)) {
      total[key] = (total[key] ?? 0) + n;
    }
  }
  return total;
}

async function printResult(store: Store, mode: string, results: ChildResult[]): Promise<void> {
  const committed = results.reduce((sum, r) => sum + r.ok, 0),
    row = await sql<{ value: number }>`select value from tasks_counter where id = 1`.execute(
      store.db,
    ),
    value = toNumber(row.rows[0]?.value);
  console.log(
    JSON.stringify({
      committed,
      errors: mergeErrors(results),
      finalValue: value,
      kind: store.kind,
      lostUpdates: committed - value,
      mode,
    }),
  );
}

async function runParent(store: Store, mode: string): Promise<void> {
  await setupCounter(store);
  const startAt = Date.now() + 1500,
    tallies = await Promise.all(Array.from({ length: PROCS }, () => readChild(mode, startAt)));
  await printResult(store, mode, tallies);
  await store.db.destroy();
}

async function runMain(argv: string[]): Promise<void> {
  const [mode = 'immediate', role, startArg] = argv;
  if (role === 'child') {
    await runChild(mode, Number(startArg));
    process.exit(0);
  }
  await runParent(createStore(readKind()), mode);
}

await runMain(process.argv.slice(2));
