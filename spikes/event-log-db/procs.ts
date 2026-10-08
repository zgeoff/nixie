/* oxlint-disable no-await-in-loop -- kills happen in sequence, with a pause between each */
// Child processes for correctness.ts: worker pools that it kills and pauses, and the counters each
// process prints when it exits.
import { readFileSync, writeFileSync } from 'node:fs';
import type { Subprocess } from 'bun';
import type { ClaimMode } from './core.ts';
import type { Store } from './db.ts';

export const LEASE_MS = 1000,
  WORKERS = 8;

export interface Run {
  store: Store;
  mode: ClaimMode;
  out: string;
}

export interface ProcSpec {
  id: string;
  args: string[];
  env?: Record<string, string>;
}

export interface Proc {
  id: string;
  proc: Subprocess<'ignore', 'pipe', 'pipe'>;
  output: Promise<string>;
}

export interface Pool {
  run: Run;
  kind: 'tasks' | 'jobs';
  stepMs: number;
  live: Map<string, Proc>;
  all: Proc[];
  chaos: string[];
}

export type Counts = Record<string, number>;

async function readOutput(run: Run, id: string, proc: Proc['proc']): Promise<string> {
  const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]),
    text = stdout + stderr;
  writeFileSync(`${run.out}/${id}.log`, text);
  return text;
}

export function startProc(run: Run, spec: ProcSpec): Proc {
  const proc = Bun.spawn(['bun', ...spec.args], {
    env: { ...process.env, ...spec.env },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  return { id: spec.id, output: readOutput(run, spec.id, proc), proc };
}

export function parseStats(text: string): Counts {
  const line = text.split('\n').find((l) => l.startsWith('stats '));
  return line ? JSON.parse(line.slice(6)) : { killed: 1 };
}

export function mergeStats(all: Counts[]): Counts {
  const total: Counts = {};
  for (const counts of all) {
    for (const [key, value] of Object.entries(counts)) {
      if (typeof value === 'number') {
        total[key] = (total[key] ?? 0) + value;
      }
    }
  }
  return total;
}

export function createPool(run: Run, kind: 'tasks' | 'jobs', stepMs: number): Pool {
  return { all: [], chaos: [], kind, live: new Map(), run, stepMs };
}

async function waitForExit(pool: Pool, p: Proc): Promise<void> {
  await p.proc.exited;
  pool.live.delete(p.id);
}

function startPoolWorker(pool: Pool, env: Record<string, string> = {}): Proc {
  const id = `${pool.kind}-w${pool.all.length}`,
    p = startProc(pool.run, {
      args: [
        'worker.ts',
        pool.kind,
        id,
        String(LEASE_MS),
        String(pool.stepMs),
        '2500',
        pool.run.mode,
      ],
      env,
      id,
    });
  pool.all.push(p);
  return p;
}

function startLiveWorker(pool: Pool): void {
  const p = startPoolWorker(pool);
  pool.live.set(p.id, p);
  void waitForExit(pool, p);
}

async function runKills(pool: Pool, kills: number): Promise<void> {
  for (let k = 0; k < kills; k++) {
    const candidates = [...pool.live.values()],
      victim = candidates[Math.floor(Math.random() * candidates.length)];
    if (victim) {
      victim.proc.kill('SIGKILL');
      pool.chaos.push(`${Date.now()} SIGKILL ${victim.id}`);
      startLiveWorker(pool);
    }
    await Bun.sleep(400);
  }
}

function isStopped(pid: number): boolean {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  return stat.slice(stat.lastIndexOf(')') + 2).startsWith('T');
}

// Waits until the worker has stopped itself (Linux /proc), then for its lease to expire.
async function sendContinue(pool: Pool, paused: Proc | undefined): Promise<void> {
  if (!paused) {
    return;
  }
  while (!isStopped(paused.proc.pid)) {
    await Bun.sleep(50);
  }
  await Bun.sleep(LEASE_MS * 2);
  paused.proc.kill('SIGCONT');
  pool.chaos.push(`${Date.now()} SIGCONT ${paused.id}`);
}

async function collectStats(pool: Pool): Promise<Counts> {
  const texts = await Promise.all(pool.all.map((p) => p.output));
  writeFileSync(`${pool.run.out}/${pool.kind}-chaos.log`, pool.chaos.join('\n'));
  return mergeStats(texts.map((text) => parseStats(text)));
}

// Runs a pool of workers and kills `kills` of them. With `pause`, one worker stops itself right
// after its 20th claim, so the pause lands mid-step, and gets SIGCONT after its lease expired.
export async function runPool(pool: Pool, kills: number, pause: boolean): Promise<Counts> {
  const paused = pause ? startPoolWorker(pool, { SPIKE_PAUSE_AFTER_CLAIM: '20' }) : undefined;
  while (pool.all.length < WORKERS) {
    startLiveWorker(pool);
  }
  await Bun.sleep(1500);
  await runKills(pool, kills);
  await sendContinue(pool, paused);
  return collectStats(pool);
}
