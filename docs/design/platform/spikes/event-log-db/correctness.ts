// Correctness under concurrency on the engine SPIKE_DB names: leased tasks with workers killed and
// paused, approvers racing over single-use approvals, and job workers killed around the provider
// call. Usage: bun correctness.ts [immediate|deferred|unlocked]; prints one JSON report.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { sql } from 'kysely';
import type { ClaimMode } from './core.ts';
import type { Store } from './db.ts';
import { createStore, readKind, resetTables, setupSchema, toNumber } from './db.ts';
import type { Counts, Pool, Run } from './procs.ts';
import { WORKERS, createPool, mergeStats, parseStats, runPool, startProc } from './procs.ts';

const APPROVALS = 300,
  JOBS = 200,
  STEPS = 5,
  TASKS = 200;

type Report = Record<string, unknown>;

interface ClaimCheck {
  doubleClaims: number;
  duplicateEpochs: number;
  recoveryMs: number[];
}

async function countStepEvents(store: Store): Promise<Counts> {
  const query = await sql<{ n: number }>`
      select count(*) as n from events where kind = 'step' group by task_id, step`.execute(
      store.db,
    ),
    values = query.rows.map((row) => toNumber(row.n));
  return {
    duplicateSteps: values.filter((n) => n > 1).length,
    stepEvents: values.reduce((sum, n) => sum + n, 0),
  };
}

// The step each claim saw decides the check, not wall-clock times from different processes.
// After a committed claim, the next claim must see the following step. After an orphaned claim,
// whose worker died or lost its lease, the next claim must see the same step, after expiry.
async function checkClaims(store: Store): Promise<ClaimCheck> {
  const claims = await store.db
      .selectFrom('claims')
      .selectAll()
      .where('kind', '=', 'task')
      .orderBy('ref_id')
      .orderBy('epoch')
      .execute(),
    committed = await store.db.selectFrom('events').select(['task_id', 'epoch']).execute(),
    keys = new Set(committed.map((e) => `${e.task_id}#${e.epoch}`)),
    result: ClaimCheck = { doubleClaims: 0, duplicateEpochs: 0, recoveryMs: [] };
  claims.forEach((next, i) => {
    const prev = claims[i - 1];
    if (!prev || prev.ref_id !== next.ref_id) {
      return;
    }
    result.duplicateEpochs += Number(toNumber(prev.epoch) === toNumber(next.epoch));
    if (keys.has(`${prev.ref_id}#${prev.epoch}`)) {
      result.doubleClaims += Number(toNumber(next.step) !== toNumber(prev.step) + 1);
      return;
    }
    result.recoveryMs.push(toNumber(next.claimed_at) - toNumber(prev.claimed_at));
    result.doubleClaims += Number(
      toNumber(next.step) !== toNumber(prev.step) ||
        toNumber(next.claimed_at) < toNumber(prev.expires_at),
    );
  });
  return result;
}

function getRecoveryRange(recoveryMs: number[]): Report | null {
  if (recoveryMs.length === 0) {
    return null;
  }
  return { max: Math.max(...recoveryMs), min: Math.min(...recoveryMs) };
}

async function checkTasks(store: Store): Promise<Report> {
  const claimRows = await store.db
      .selectFrom('claims')
      .select('id')
      .where('kind', '=', 'task')
      .execute(),
    claims = await checkClaims(store),
    steps = await countStepEvents(store),
    tasks = await store.db.selectFrom('tasks').selectAll().execute();
  return {
    ...steps,
    claims: claimRows.length,
    doubleClaims: claims.doubleClaims,
    duplicateEpochs: claims.duplicateEpochs,
    expectedStepEvents: TASKS * STEPS,
    notDone: tasks.filter((t) => t.state !== 'done' || toNumber(t.step) !== STEPS).length,
    orphanedClaims: claims.recoveryMs.length,
    recoveryMs: getRecoveryRange(claims.recoveryMs),
    tasks: tasks.length,
  };
}

async function setupTasks(store: Store, start: number): Promise<void> {
  await store.db
    .insertInto('tasks')
    .values(
      Array.from({ length: TASKS }, (_, i) => ({
        id: `t${String(i).padStart(4, '0')}`,
        run_at: start + i,
        state: 'runnable' as const,
        steps: STEPS,
        updated_at: start,
      })),
    )
    .execute();
}

// Kills and the pause run only in the main mode; the control modes measure the claim alone.
async function runTaskPool(run: Run, start: number): Promise<Report> {
  const hasChaos = run.mode === 'immediate',
    kills = hasChaos ? 5 : 0,
    pool = createPool(run, 'tasks', 30),
    totals = await runPool(pool, kills, hasChaos),
    verdict = await checkTasks(run.store);
  return {
    chaos: pool.chaos,
    totals,
    workers: pool.all.length,
    ...verdict,
    wallMs: Date.now() - start,
  };
}

async function runLeaseTest(run: Run): Promise<Report> {
  const start = Date.now();
  await setupTasks(run.store, start);
  return runTaskPool(run, start);
}

function isValidApproval(id: string): boolean {
  return Number(id.slice(1)) < APPROVALS;
}

// 300 valid approvals, 20 expired, and 20 whose stored hash no approver sends.
function buildApprovals(now: number) {
  return Array.from({ length: APPROVALS + 40 }, (_, i) => {
    const id = `a${String(i).padStart(4, '0')}`,
      isExpired = i >= APPROVALS && i < APPROVALS + 20,
      isWrongHash = i >= APPROVALS + 20;
    return {
      action_hash: isWrongHash ? `other-${id}` : `hash-${id}`,
      expires_at: isExpired ? now - 1000 : now + 3_600_000,
      id,
      status: 'pending' as const,
    };
  });
}

async function checkApprovals(store: Store): Promise<Counts> {
  const query = await sql<{ id: string; jobs: number; started: number }>`
      select a.id,
        (select count(*) from jobs j where j.approval_id = a.id) as jobs,
        (select count(*) from events e where e.kind = 'action.started'
           and e.task_id = 'task-' || a.id) as started
      from approvals a`.execute(store.db),
    rows = query.rows;
  return {
    invalidWithAnyJob: rows.filter((r) => !isValidApproval(r.id) && toNumber(r.jobs) > 0).length,
    validTotal: rows.filter((r) => isValidApproval(r.id)).length,
    validWithExactlyOneJob: rows.filter(
      (r) => isValidApproval(r.id) && toNumber(r.jobs) === 1 && toNumber(r.started) === 1,
    ).length,
  };
}

async function runApprovers(run: Run, startAt: number): Promise<Counts> {
  const approvers = Array.from({ length: WORKERS }, (_, i) =>
      startProc(run, { args: ['approve.ts', `ap${i}`, String(startAt)], id: `approve-${i}` }),
    ),
    texts = await Promise.all(approvers.map((p) => p.output));
  return mergeStats(texts.map((text) => parseStats(text)));
}

async function runApprovalTest(run: Run): Promise<Report> {
  await run.store.db.insertInto('approvals').values(buildApprovals(Date.now())).execute();
  const startAt = Date.now() + 1500,
    totals = await runApprovers(run, startAt),
    verdict = await checkApprovals(run.store);
  return {
    approvers: WORKERS,
    attempts: WORKERS * (APPROVALS + 40),
    errors: totals.errors,
    won: totals.won,
    ...verdict,
    wallMs: Date.now() - startAt,
  };
}

function countProviderRequests(logPath: string): Map<string, number> {
  const requests = new Map<string, number>();
  for (const line of readFileSync(logPath, 'utf8').split('\n').filter(Boolean)) {
    const [id = ''] = line.split(' ');
    requests.set(id, (requests.get(id) ?? 0) + 1);
  }
  return requests;
}

async function checkJobs(store: Store, logPath: string): Promise<Report> {
  const jobs = await store.db.selectFrom('jobs').selectAll().execute(),
    noKey = jobs.filter((j) => j.idempotency_key === null),
    requests = countProviderRequests(logPath),
    unknown = jobs.filter((j) => j.status === 'unknown'),
    withKey = jobs.filter((j) => j.idempotency_key !== null);
  return {
    byStatus: mergeStats(jobs.map((j) => ({ [j.status]: 1 }))),
    noKeyDoneWithoutRequest: noKey.filter((j) => j.status === 'done' && !requests.has(j.id)).length,
    noKeySentTwice: noKey.filter((j) => (requests.get(j.id) ?? 0) > 1).length,
    unknownNeverSent: unknown.filter((j) => !requests.has(j.id)).length,
    unknownReachedProvider: unknown.filter((j) => requests.get(j.id) === 1).length,
    withKeyNotDone: withKey.filter((j) => j.status !== 'done').length,
    withKeyRepeatedRequests: withKey.filter((j) => (requests.get(j.id) ?? 0) > 1).length,
    withKeyRetried: withKey.filter((j) => toNumber(j.attempts) > 1).length,
  };
}

async function setupJobs(store: Store, logPath: string): Promise<void> {
  const start = Date.now();
  writeFileSync(logPath, '');
  process.env.SPIKE_PROVIDER_LOG = logPath;
  await store.db.deleteFrom('jobs').execute();
  await store.db
    .insertInto('jobs')
    .values(
      Array.from({ length: JOBS }, (_, i) => ({
        action: 'send_email',
        approval_id: null,
        id: `j${String(i).padStart(4, '0')}`,
        idempotency_key: i % 2 === 0 ? `key-j${i}` : null,
        status: 'pending' as const,
        task_id: `jt${i}`,
        updated_at: start + i,
      })),
    )
    .execute();
}

async function runJobPool(run: Run, pool: Pool, logPath: string): Promise<Counts> {
  await setupJobs(run.store, logPath);
  return runPool(pool, 8, false);
}

// 200 outside-action jobs, half with an idempotency key, with 8 workers killed around the call.
async function runJobTest(run: Run): Promise<Report> {
  const logPath = `${run.out}/provider.log`,
    pool = createPool(run, 'jobs', 120),
    totals = await runJobPool(run, pool, logPath),
    verdict = await checkJobs(run.store, logPath);
  return { chaos: pool.chaos, totals, workers: pool.all.length, ...verdict };
}

async function runChecks(run: Run, report: Report): Promise<void> {
  report.leases = await runLeaseTest(run);
  if (run.mode === 'immediate') {
    report.approvals = await runApprovalTest(run);
    report.jobs = await runJobTest(run);
  }
}

async function runCorrectness(mode: ClaimMode): Promise<void> {
  const kind = readKind(),
    out = `results/${kind}-${mode}`,
    report: Report = { kind, txMode: mode },
    run: Run = { mode, out, store: createStore(kind) };
  rmSync(out, { force: true, recursive: true });
  mkdirSync(out, { recursive: true });
  await setupSchema(run.store);
  await resetTables(run.store);
  await runChecks(run, report);
  console.log(JSON.stringify(report, null, 2));
  await run.store.db.destroy();
}

await runCorrectness((process.argv[2] ?? 'immediate') as ClaimMode);
