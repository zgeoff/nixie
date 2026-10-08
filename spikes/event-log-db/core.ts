// The durable layer's primitives: a leased task step, a single-use approval, and an outside-action
// job with explicit outcomes. Every exported function runs one transaction through writeTx.
import { appendFileSync } from 'node:fs';
import type { Insertable, Selectable } from 'kysely';
import { sql } from 'kysely';
import type { ClaimRow, EventRow, JobRow, Store, TaskRow, Tx } from './db.ts';
import { toNumber, writeTx } from './db.ts';

// `unlocked` is the negative control for the double-claim check. On Postgres it drops FOR UPDATE
// from the claim's subquery; on SQLite it picks the task in a read outside the write transaction.
export type ClaimMode = 'immediate' | 'deferred' | 'unlocked';

export type Task = Selectable<TaskRow>;
export type Job = Selectable<JobRow>;

// The process acting on the log, and how it opens its transactions.
export interface Actor {
  store: Store;
  worker: string;
  mode: ClaimMode;
}

export class FencedError extends Error {
  public override name = 'FencedError';
}

function getTxMode(actor: Actor): 'immediate' | 'deferred' {
  return actor.mode === 'deferred' ? 'deferred' : 'immediate';
}

function buildReadyQuery(tx: Tx, t: number) {
  return tx
    .selectFrom('tasks')
    .select('id')
    .where('state', '=', 'runnable')
    .where('run_at', '<=', t)
    .where((eb) => eb.or([eb('lease_expires_at', 'is', null), eb('lease_expires_at', '<', t)]))
    .orderBy('run_at')
    .limit(1);
}

async function writeClaim(tx: Tx, claim: Insertable<ClaimRow>): Promise<void> {
  await tx.insertInto('claims').values(claim).execute();
}

async function writeEvent(tx: Tx, event: Insertable<EventRow>): Promise<void> {
  await tx.insertInto('events').values(event).execute();
}

// The SQLite negative control reads the ready task before its write transaction starts.
async function pickUnlocked(actor: Actor): Promise<string | undefined> {
  if (actor.store.kind === 'pg' || actor.mode !== 'unlocked') {
    return undefined;
  }
  const row = await buildReadyQuery(actor.store.db, Date.now()).executeTakeFirst();
  return row?.id ?? '';
}

function buildClaimSubquery(actor: Actor, tx: Tx, t: number) {
  const ready = buildReadyQuery(tx, t);
  if (actor.store.kind === 'pg' && actor.mode !== 'unlocked') {
    return ready.forUpdate().skipLocked();
  }
  return ready;
}

// Claims the oldest ready task whose lease is free or expired, and logs the claim.
export async function claimTask(actor: Actor, ttlMs: number): Promise<Task | undefined> {
  const picked = await pickUnlocked(actor);
  if (picked === '') {
    return undefined;
  }
  return writeTx(
    actor.store,
    async (tx) => {
      const t = Date.now(),
        task = await tx
          .updateTable('tasks')
          .set({
            lease_epoch: sql`lease_epoch + 1`,
            lease_expires_at: t + ttlMs,
            lease_owner: actor.worker,
            updated_at: t,
          })
          .where('id', '=', picked ?? buildClaimSubquery(actor, tx, t))
          .returningAll()
          .executeTakeFirst();
      if (task) {
        await writeClaim(tx, {
          claimed_at: t,
          epoch: task.lease_epoch,
          expires_at: t + ttlMs,
          kind: 'task',
          ref_id: task.id,
          step: task.step,
          worker: actor.worker,
        });
      }
      return task;
    },
    getTxMode(actor),
  );
}

// Appends the step's event and advances the state machine, only while the lease is still ours.
export async function writeStep(actor: Actor, task: Task, payload: string): Promise<void> {
  await writeTx(
    actor.store,
    async (tx) => {
      const at = Date.now(),
        row = await tx
          .updateTable('tasks')
          .set({
            lease_expires_at: null,
            lease_owner: null,
            state: sql`case when step + 1 >= steps then 'done' else 'runnable' end`,
            step: sql`step + 1`,
            updated_at: at,
          })
          .where('id', '=', task.id)
          .where('lease_owner', '=', actor.worker)
          .where('lease_epoch', '=', task.lease_epoch)
          .returning('id')
          .executeTakeFirst();
      if (!row) {
        throw new FencedError(`lease on ${task.id} epoch ${task.lease_epoch} lost`);
      }
      await writeEvent(tx, {
        created_at: at,
        epoch: toNumber(task.lease_epoch),
        kind: 'step',
        payload,
        step: toNumber(task.step),
        task_id: task.id,
        worker: actor.worker,
      });
    },
    getTxMode(actor),
  );
}

async function startApprovedJob(tx: Tx, approvalId: string, worker: string): Promise<void> {
  const at = Date.now();
  await tx
    .insertInto('jobs')
    .values({
      action: 'send_email',
      approval_id: approvalId,
      id: `job-${approvalId}`,
      idempotency_key: null,
      status: 'pending',
      task_id: `task-${approvalId}`,
      updated_at: at,
    })
    .execute();
  await writeEvent(tx, {
    created_at: at,
    kind: 'action.started',
    payload: JSON.stringify({ approvalId }),
    task_id: `task-${approvalId}`,
    worker,
  });
}

// Consumes the approval and starts its action in one transaction: the job row and its event exist
// only if this call flipped the approval from pending to consumed.
export function useApproval(
  actor: Actor,
  approvalId: string,
  actionHash: string,
): Promise<boolean> {
  return writeTx(actor.store, async (tx) => {
    const at = Date.now(),
      row = await tx
        .updateTable('approvals')
        .set({ consumed_at: at, consumed_by: actor.worker, status: 'consumed' })
        .where('id', '=', approvalId)
        .where('status', '=', 'pending')
        .where('action_hash', '=', actionHash)
        .where('expires_at', '>', at)
        .returning('id')
        .executeTakeFirst();
    if (!row) {
      return false;
    }
    await startApprovedJob(tx, approvalId, actor.worker);
    return true;
  });
}

function buildJobSubquery(actor: Actor, tx: Tx) {
  const ready = tx
    .selectFrom('jobs')
    .select('id')
    .where('status', '=', 'pending')
    .orderBy('updated_at')
    .limit(1);
  if (actor.store.kind === 'pg') {
    return ready.forUpdate().skipLocked();
  }
  return ready;
}

export function claimJob(actor: Actor, ttlMs: number): Promise<Job | undefined> {
  return writeTx(actor.store, async (tx) => {
    const at = Date.now(),
      job = await tx
        .updateTable('jobs')
        .set({
          attempts: sql`attempts + 1`,
          lease_epoch: sql`lease_epoch + 1`,
          lease_expires_at: at + ttlMs,
          lease_owner: actor.worker,
          status: 'running',
          updated_at: at,
        })
        .where('id', '=', buildJobSubquery(actor, tx))
        .returningAll()
        .executeTakeFirst();
    if (job) {
      await writeClaim(tx, {
        claimed_at: at,
        epoch: job.lease_epoch,
        expires_at: at + ttlMs,
        kind: 'job',
        ref_id: job.id,
        step: job.attempts,
        worker: actor.worker,
      });
    }
    return job;
  });
}

// The stand-in provider: it appends each request to a log outside nixie's database.
export function sendToProvider(logPath: string, job: Job, worker: string): void {
  const line = [job.id, job.idempotency_key ?? '-', worker, toNumber(job.lease_epoch)].join(' ');
  appendFileSync(logPath, `${line}\n`);
}

export async function writeJobOutcome(actor: Actor, job: Job, outcome: 'done' | 'failed') {
  await writeTx(actor.store, async (tx) => {
    const at = Date.now(),
      row = await tx
        .updateTable('jobs')
        .set({ lease_expires_at: null, lease_owner: null, status: outcome, updated_at: at })
        .where('id', '=', job.id)
        .where('status', '=', 'running')
        .where('lease_epoch', '=', job.lease_epoch)
        .returning('id')
        .executeTakeFirst();
    if (!row) {
      throw new FencedError(`lease on ${job.id} epoch ${job.lease_epoch} lost`);
    }
    await writeEvent(tx, {
      created_at: at,
      kind: `job.${outcome}`,
      payload: JSON.stringify({ jobId: job.id }),
      task_id: job.task_id,
      worker: actor.worker,
    });
  });
}

// A running job whose lease expired may have reached the provider. With an idempotency key it goes
// back to pending; without one it becomes unknown and waits for the owner.
export function resetExpiredJobs(actor: Actor): Promise<number> {
  return writeTx(actor.store, async (tx) => {
    const at = Date.now(),
      swept = await tx
        .updateTable('jobs')
        .set({
          lease_expires_at: null,
          lease_owner: null,
          status: sql`case when idempotency_key is null then 'unknown' else 'pending' end`,
          updated_at: at,
        })
        .where('status', '=', 'running')
        .where('lease_expires_at', '<', at)
        .returning(['id', 'task_id', 'status'])
        .execute();
    await Promise.all(
      swept.map((job) =>
        writeEvent(tx, {
          created_at: at,
          kind: `job.swept.${job.status}`,
          payload: JSON.stringify({ jobId: job.id }),
          task_id: job.task_id,
          worker: actor.worker,
        }),
      ),
    );
    return swept.length;
  });
}
