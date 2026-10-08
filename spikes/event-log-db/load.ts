/* oxlint-disable no-await-in-loop -- serial transactions are what the serial bursts measure */
// Append plus state transition in one transaction: 50 per second for 20 s, a serial burst of 500,
// and a burst of 1,000 from 4 processes, with latency per transaction and event-loop lag.
// Usage: bun load.ts (engine from SPIKE_DB), or bun load.ts child <n> for one burst process.
import { sql } from 'kysely';
import type { Store } from './db.ts';
import { createStore, readKind, resetTables, setupSchema, writeTx } from './db.ts';

const PAYLOAD = JSON.stringify({ text: 'x'.repeat(400) }),
  TASKS = 100;

interface Summary {
  n: number;
  perSec: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  maxLagMs?: number;
}

async function runTransition(store: Store, i: number): Promise<number> {
  const id = `load-${i % TASKS}`,
    start = performance.now();
  await writeTx(store, async (tx) => {
    await tx
      .updateTable('tasks')
      .set({ step: sql`step + 1`, updated_at: Date.now() })
      .where('id', '=', id)
      .execute();
    await tx
      .insertInto('events')
      .values({ created_at: Date.now(), kind: 'load', payload: PAYLOAD, task_id: id })
      .execute();
  });
  return performance.now() - start;
}

function getPercentile(sorted: number[], p: number): number {
  const value = sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? Number.NaN;
  return Number(value.toFixed(2));
}

function buildSummary(latencies: number[], wallMs: number): Summary {
  const sorted = latencies.toSorted((a, b) => a - b);
  return {
    max: getPercentile(sorted, 1),
    n: sorted.length,
    p50: getPercentile(sorted, 0.5),
    p95: getPercentile(sorted, 0.95),
    p99: getPercentile(sorted, 0.99),
    perSec: Math.round((sorted.length / wallMs) * 1000),
  };
}

// Measures how late a 5 ms timer fires while fn runs: the event-loop block a caller would see.
async function withLag(fn: () => Promise<Summary>): Promise<Summary> {
  const lag = { expected: performance.now() + 5, max: 0 },
    poll = setInterval(() => {
      const t = performance.now();
      lag.max = Math.max(lag.max, t - lag.expected);
      lag.expected = t + 5;
    }, 5),
    summary = await fn();
  clearInterval(poll);
  return { ...summary, maxLagMs: Number(lag.max.toFixed(1)) };
}

// Each transaction starts on its own 20 ms schedule, whether or not the last one finished.
async function runSteady(store: Store): Promise<Summary> {
  const latencies: number[] = [],
    pending: Promise<void>[] = [],
    start = performance.now();
  for (let i = 0; i < 1000; i++) {
    await Bun.sleep(Math.max(0, start + i * 20 - performance.now()));
    pending.push(
      (async () => {
        const ms = await runTransition(store, i);
        latencies.push(ms);
      })(),
    );
  }
  await Promise.all(pending);
  return buildSummary(latencies, performance.now() - start);
}

async function runSerial(store: Store, count: number): Promise<number[]> {
  const latencies: number[] = [];
  for (let i = 0; i < count; i++) {
    const ms = await runTransition(store, i);
    latencies.push(ms);
  }
  return latencies;
}

async function runSerialBurst(store: Store): Promise<Summary> {
  const began = performance.now(),
    latencies = await runSerial(store, 500);
  return buildSummary(latencies, performance.now() - began);
}

async function readChild(): Promise<{ latencies: number[] }> {
  const child = Bun.spawn(['bun', 'load.ts', 'child', '250'], { env: process.env, stdout: 'pipe' }),
    text = await new Response(child.stdout).text();
  return JSON.parse(text);
}

async function runProcessBurst(): Promise<Summary> {
  const began = performance.now(),
    outputs = await Promise.all(Array.from({ length: 4 }, () => readChild()));
  return buildSummary(
    outputs.flatMap((o) => o.latencies),
    performance.now() - began,
  );
}

async function setupLoad(store: Store): Promise<void> {
  await setupSchema(store);
  await resetTables(store);
  await store.db
    .insertInto('tasks')
    .values(
      Array.from({ length: TASKS }, (_, i) => ({
        id: `load-${i}`,
        run_at: 0,
        state: 'runnable' as const,
        steps: 1_000_000,
        updated_at: 0,
      })),
    )
    .execute();
}

async function runParent(store: Store): Promise<void> {
  await setupLoad(store);
  const report = {
    kind: store.kind,
    sqliteSync: store.kind === 'pg' ? null : (process.env.SPIKE_SQLITE_SYNC ?? 'NORMAL'),
    steady50PerSec: await withLag(() => runSteady(store)),
    burst500Serial: await withLag(() => runSerialBurst(store)),
    burst1000From4Procs: await runProcessBurst(),
  };
  console.log(JSON.stringify(report));
  await store.db.destroy();
}

async function runChild(count: number): Promise<void> {
  const began = performance.now(),
    handle = createStore(readKind(), 1),
    latencies = await runSerial(handle, count);
  console.log(JSON.stringify({ latencies, wallMs: performance.now() - began }));
  await handle.db.destroy();
  process.exit(0);
}

if (process.argv[2] === 'child') {
  await runChild(Number(process.argv[3]));
}
if (import.meta.main) {
  await runParent(createStore(readKind()));
}
