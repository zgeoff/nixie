/* oxlint-disable no-await-in-loop -- tasks are committed one at a time, with a wait between */
// Waking a worker on new work. A listener idles for SPIKE_IDLE_MS while it measures its own CPU,
// then the parent commits 50 tasks one at a time; latency runs from commit to claim.
// Usage: bun wake.ts <pg-listen | poll-query-<ms> | poll-version-<ms> | watch-wal>
import { watch } from 'node:fs';
import { SQL } from 'bun';
import { sql } from 'kysely';
import type { Actor } from './core.ts';
import { claimTask } from './core.ts';
import type { Kind, Store } from './db.ts';
import { PG_URL, createStore, getSqlitePath, resetTables, setupSchema, writeTx } from './db.ts';

const IDLE_MS = Number(process.env.SPIKE_IDLE_MS ?? 30_000),
  TASKS = 50;

type Wake = () => void;

interface Lines {
  all: string[];
  waiters: { match: string; resolve: (line: string | undefined) => void }[];
}

function getClock(): number {
  return performance.timeOrigin + performance.now();
}

async function drainTasks(actor: Actor): Promise<void> {
  for (;;) {
    const task = await claimTask(actor, 60_000);
    if (!task) {
      return;
    }
    console.log(`claimed ${task.id} ${getClock()}`);
  }
}

// Coalesces wake-ups: a wake during a drain runs one more drain after it.
function createWaker(actor: Actor): Wake {
  const drain = async (): Promise<void> => {
      state.busy = true;
      do {
        state.again = false;
        await drainTasks(actor);
      } while (state.again);
      state.busy = false;
    },
    state = { again: false, busy: false };
  return () => {
    if (state.busy) {
      state.again = true;
      return;
    }
    void drain();
  };
}

// onlisten runs after every reconnect, so a drain there picks up work notified while down.
async function startListen(wake: Wake): Promise<void> {
  const client = new SQL({ max: 1, url: PG_URL });
  await client.listen('nixie_work', wake, () => {
    console.log(`listening ${getClock()}`);
    wake();
  });
}

function startQueryPoll(store: Store, wake: Wake, everyMs: number): void {
  setInterval(async () => {
    const at = Date.now(),
      ready = await store.db
        .selectFrom('tasks')
        .select('id')
        .where('state', '=', 'runnable')
        .where('run_at', '<=', at)
        .where((eb) => eb.or([eb('lease_expires_at', 'is', null), eb('lease_expires_at', '<', at)]))
        .limit(1)
        .executeTakeFirst();
    if (ready) {
      wake();
    }
  }, everyMs);
}

// PRAGMA data_version changes when another connection commits to the file.
function startVersionPoll(store: Store, wake: Wake, everyMs: number): void {
  const seen = { version: -1 };
  setInterval(async () => {
    const row = await sql<{ data_version: number }>`pragma data_version`.execute(store.db),
      version = row.rows[0]?.data_version ?? -1;
    if (version !== seen.version) {
      seen.version = version;
      wake();
    }
  }, everyMs);
}

async function startStrategy(strategy: string, store: Store, wake: Wake): Promise<void> {
  const [, everyMs = '0'] = /-(?<ms>\d+)$/u.exec(strategy) ?? [];
  if (strategy === 'pg-listen') {
    await startListen(wake);
  } else if (strategy.startsWith('poll-query-')) {
    startQueryPoll(store, wake, Number(everyMs));
  } else if (strategy.startsWith('poll-version-')) {
    startVersionPoll(store, wake, Number(everyMs));
  } else if (strategy === 'watch-wal') {
    watch(`${getSqlitePath()}-wal`, wake);
  } else {
    throw new Error(`unknown strategy ${strategy}`);
  }
}

function formatIdle(before: NodeJS.CpuUsage, startedAt: number): string {
  const used = process.cpuUsage(before);
  return JSON.stringify({
    cpuMs: (used.user + used.system) / 1000,
    wallMs: getClock() - startedAt,
  });
}

async function runIdle(): Promise<string> {
  const before = process.cpuUsage(),
    startedAt = getClock();
  await Bun.sleep(IDLE_MS);
  return formatIdle(before, startedAt);
}

async function runListener(strategy: string, store: Store): Promise<void> {
  const actor: Actor = { mode: 'immediate', store, worker: 'listener' };
  await startStrategy(strategy, store, createWaker(actor));
  console.log('ready');
  console.log(`idle ${await runIdle()}`);
}

async function readPgServerCpuUsec(): Promise<number> {
  const text = await Bun.$`docker exec nixie-spike-pg cat /sys/fs/cgroup/cpu.stat`.text(),
    usage = /usage_usec (?<usec>\d+)/u.exec(text)?.groups?.usec;
  return Number(usage ?? Number.NaN);
}

function handleLine(lines: Lines, line: string): void {
  lines.all.push(line);
  for (const waiter of lines.waiters.filter((w) => line.startsWith(w.match))) {
    lines.waiters.splice(lines.waiters.indexOf(waiter), 1);
    waiter.resolve(line);
  }
}

async function readLines(stream: ReadableStream<Uint8Array>, lines: Lines): Promise<void> {
  const decoder = new TextDecoder(),
    state = { buffer: '' };
  for await (const chunk of stream) {
    state.buffer += decoder.decode(chunk);
    const parts = state.buffer.split('\n');
    state.buffer = parts.pop() ?? '';
    for (const line of parts) {
      handleLine(lines, line);
    }
  }
}

function waitForLine(lines: Lines, match: string, timeoutMs: number): Promise<string | undefined> {
  const found = lines.all.find((l) => l.startsWith(match)),
    pending = Promise.withResolvers<string | undefined>();
  if (found) {
    return Promise.resolve(found);
  }
  lines.waiters.push({ match, resolve: pending.resolve });
  setTimeout(() => pending.resolve(undefined), timeoutMs);
  return pending.promise;
}

async function writeTask(store: Store, id: string): Promise<number> {
  await writeTx(store, async (tx) => {
    await tx
      .insertInto('tasks')
      .values({ id, run_at: Date.now(), state: 'runnable', steps: 1, updated_at: Date.now() })
      .execute();
    if (store.kind === 'pg') {
      await sql`select pg_notify('nixie_work', ${id})`.execute(tx);
    }
  });
  return getClock();
}

function readClaimTime(line: string | undefined): number {
  return Number(line?.split(' ')[2] ?? Number.NaN);
}

async function runLatencyTrial(store: Store, lines: Lines): Promise<number[]> {
  const latencies: number[] = [];
  for (let i = 0; i < TASKS; i++) {
    const committedAt = await writeTask(store, `wake-${i}`),
      line = await waitForLine(lines, `claimed wake-${i} `, 5000);
    if (line) {
      latencies.push(readClaimTime(line) - committedAt);
    }
    await Bun.sleep(50 + Math.random() * 1000);
  }
  return latencies.toSorted((a, b) => a - b);
}

// Drops the listener's connection. Bun.SQL reconnects, and the drain in onlisten must find the
// tasks committed while it was down, since their notifications went nowhere.
async function checkReconnect(store: Store, lines: Lines): Promise<Record<string, number>> {
  await sql`select pg_terminate_backend(pid) from pg_stat_activity where query ilike 'listen%'`.execute(
    store.db,
  );
  const batch = Array.from({ length: 5 }, (_, i) => `missed-${i}`),
    commits = await Promise.all(batch.map((id) => writeTask(store, id))),
    found = await Promise.all(batch.map((id) => waitForLine(lines, `claimed ${id} `, 15_000)));
  return {
    claimed: found.filter(Boolean).length,
    maxMs: Math.max(...found.map((line, i) => readClaimTime(line) - (commits[i] ?? 0))),
    of: batch.length,
    relistened: lines.all.filter((l) => l.startsWith('listening')).length - 1,
  };
}

function getPercentile(sorted: number[], p: number): number | undefined {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

async function readIdle(store: Store, lines: Lines): Promise<Record<string, unknown>> {
  await waitForLine(lines, 'ready', IDLE_MS + 30_000);
  const before = store.kind === 'pg' ? await readPgServerCpuUsec() : 0,
    idleLine = await waitForLine(lines, 'idle', IDLE_MS + 30_000),
    later = store.kind === 'pg' ? await readPgServerCpuUsec() : 0,
    parsed = JSON.parse(idleLine?.slice(5) ?? '{}');
  return {
    listenerIdleCpuMs: Math.round(parsed.cpuMs),
    listenerIdleCpuPct: Number(((parsed.cpuMs / parsed.wallMs) * 100).toFixed(3)),
    serverIdleCpuMs: store.kind === 'pg' ? Math.round((later - before) / 1000) : null,
  };
}

async function runTrials(strategy: string, store: Store, lines: Lines): Promise<void> {
  const idle = await readIdle(store, lines),
    latencies = await runLatencyTrial(store, lines),
    reconnect = store.kind === 'pg' ? await checkReconnect(store, lines) : null;
  console.log(
    JSON.stringify({
      strategy,
      ...idle,
      delivered: latencies.length,
      latencyMs: {
        max: latencies.at(-1),
        p50: getPercentile(latencies, 0.5),
        p95: getPercentile(latencies, 0.95),
      },
      ...(reconnect && { afterListenerKilled: reconnect }),
    }),
  );
}

async function runParent(strategy: string, store: Store): Promise<void> {
  const child = Bun.spawn(['bun', 'wake.ts', strategy, 'child'], {
      env: process.env,
      stderr: 'inherit',
      stdout: 'pipe',
    }),
    lines: Lines = { all: [], waiters: [] },
    reading = readLines(child.stdout, lines);
  await runTrials(strategy, store, lines);
  child.kill();
  await reading;
}

async function runMain(strategy: string, role: string | undefined): Promise<void> {
  const kind: Kind = strategy === 'pg-listen' ? 'pg' : 'sqlite',
    store = createStore(kind, 2);
  if (role === 'child') {
    await runListener(strategy, store);
    return;
  }
  await setupSchema(store);
  await resetTables(store);
  await runParent(strategy, store);
  await store.db.destroy();
  process.exit(0);
}

await runMain(process.argv[2] ?? 'watch-wal', process.argv[3]);
