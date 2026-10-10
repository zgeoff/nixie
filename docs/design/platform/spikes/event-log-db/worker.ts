/* oxlint-disable no-await-in-loop -- a worker runs one step at a time by design */
// One worker process: it claims tasks or jobs and runs one step at a time under a lease.
// Usage: bun worker.ts <tasks|jobs> <worker_id> <ttl_ms> <step_ms> <idle_exit_ms> [claim_mode]
// Env: SPIKE_PROVIDER_LOG for jobs; SPIKE_PAUSE_AFTER_CLAIM stops it with SIGSTOP after that claim.
import type { Actor, ClaimMode } from './core.ts';
import {
  FencedError,
  claimJob,
  claimTask,
  resetExpiredJobs,
  sendToProvider,
  writeJobOutcome,
  writeStep,
} from './core.ts';
import { createStore, readKind } from './db.ts';

interface Stats {
  worker: string;
  claims: number;
  commits: number;
  fenced: number;
  errors: number;
  swept: number;
  lastError: string;
}

interface Worker {
  actor: Actor;
  mode: string;
  ttlMs: number;
  stepMs: number;
  idleExitMs: number;
  pauseAfter: number;
  stats: Stats;
}

function createWorker(argv: string[]): Worker {
  const [mode = 'tasks', worker = 'w', ttl, step, idle, claimMode = 'immediate'] = argv;
  return {
    actor: { mode: claimMode as ClaimMode, store: createStore(readKind(), 2), worker },
    idleExitMs: Number(idle),
    mode,
    pauseAfter: Number(process.env.SPIKE_PAUSE_AFTER_CLAIM ?? 0),
    stats: { claims: 0, commits: 0, errors: 0, fenced: 0, lastError: '', swept: 0, worker },
    stepMs: Number(step),
    ttlMs: Number(ttl),
  };
}

function countError(w: Worker, error: unknown): void {
  if (error instanceof FencedError) {
    w.stats.fenced += 1;
    console.error(`${w.actor.worker} fenced: ${error.message}`);
    return;
  }
  w.stats.errors += 1;
  w.stats.lastError = String(error).slice(0, 200);
}

function countClaim(w: Worker, label: string): void {
  w.stats.claims += 1;
  console.log(`claimed ${label}`);
}

// Runs fn and counts a fenced commit or an error instead of throwing.
async function tryStep<T>(w: Worker, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    countError(w, error);
    return fallback;
  }
}

// Stops this process mid-step; the orchestrator sends SIGCONT after the lease has expired.
function checkPause(w: Worker, taskId: string): void {
  if (w.stats.claims === w.pauseAfter) {
    console.log(`pausing holding ${taskId}`);
    process.kill(process.pid, 'SIGSTOP');
  }
}

async function runTaskStep(w: Worker): Promise<boolean> {
  const task = await tryStep(w, () => claimTask(w.actor, w.ttlMs), null);
  if (task === undefined) {
    return false;
  }
  if (task) {
    countClaim(w, `${task.id} epoch ${task.lease_epoch}`);
    checkPause(w, task.id);
    await Bun.sleep(w.stepMs);
    const payload = JSON.stringify({ note: 'x'.repeat(200) });
    w.stats.commits += await tryStep(w, () => writeStep(w.actor, task, payload).then(() => 1), 0);
  }
  return true;
}

// The request leaves for the provider halfway through the step, so a kill lands on either side.
async function runJobStep(w: Worker): Promise<boolean> {
  w.stats.swept += await tryStep(w, () => resetExpiredJobs(w.actor), 0);
  const job = await tryStep(w, () => claimJob(w.actor, w.ttlMs), undefined);
  if (!job) {
    return false;
  }
  countClaim(w, `${job.id} epoch ${job.lease_epoch}`);
  await Bun.sleep(w.stepMs / 2);
  sendToProvider(process.env.SPIKE_PROVIDER_LOG ?? 'provider.log', job, w.actor.worker);
  await Bun.sleep(w.stepMs / 2);
  w.stats.commits += await tryStep(w, () => writeJobOutcome(w.actor, job, 'done').then(() => 1), 0);
  return true;
}

async function runWorker(w: Worker): Promise<void> {
  const state = { idleSince: Date.now(), stopping: false };
  process.on('SIGTERM', () => {
    state.stopping = true;
  });
  while (!state.stopping && Date.now() - state.idleSince <= w.idleExitMs) {
    const worked = w.mode === 'jobs' ? await runJobStep(w) : await runTaskStep(w);
    if (worked) {
      state.idleSince = Date.now();
    } else {
      await Bun.sleep(20);
    }
  }
  console.log(`stats ${JSON.stringify(w.stats)}`);
  await w.actor.store.db.destroy();
}

await runWorker(createWorker(process.argv.slice(2)));
process.exit(0);
