import { withWriteTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { isGateBarring } from '../gate/is-gate-barring';
import { readTaskHolds } from '../gate/read-task-holds';
import type { ClaimCandidate, Lease, LeaseKind, TasksContext, TasksTables } from '../types';
import { waitAtFaultPoint } from './wait-at-fault-point';

export interface ClaimRequest {
  readonly kind: LeaseKind;
  readonly holder: string;
  readonly durationMs: number;

  readonly readCandidate: (tx: Transaction<unknown>, now: number) => Promise<ClaimCandidate | null>;

  readonly onClaim?: (tx: Transaction<unknown>, lease: Lease) => Promise<void>;
}

export async function claimLease(
  context: Pick<TasksContext, 'clock' | 'log'>,
  request: ClaimRequest,
): Promise<Lease | null> {
  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('claim.before', { kind: request.kind, id: null });
  }

  const lease = await withWriteTransaction(context.log.writer, async (tx) => {
    const now = context.clock.now();

    const candidate = await request.readCandidate(tx, now);

    if (candidate === null) {
      return null;
    }

    const isRefused = await probeRefusalByGate(tx, request.kind, candidate);

    if (isRefused) {
      return null;
    }

    const held = await upsertLease(tx, {
      kind: request.kind,
      workID: candidate.workID,
      holder: request.holder,
      epoch: context.log.writer.epoch,
      expiresAt: now + request.durationMs,
      now,
    });

    if (held !== null) {
      await request.onClaim?.(tx, held);
    }

    return held;
  });

  if (NIXIE_TEST_BUILD && lease !== null) {
    await waitAtFaultPoint('claim.after', { kind: lease.kind, id: lease.workID });
  }

  return lease;
}

// The claim queries filter with the gate's own predicate, so a candidate that the gate bars means a
// query that skipped it: the test build throws, and a release refuses the claim.
async function probeRefusalByGate(
  tx: Transaction<unknown>,
  kind: LeaseKind,
  candidate: ClaimCandidate,
): Promise<boolean> {
  const holds = await readTaskHolds(tx, candidate.taskID);

  const caller = kind === 'task' ? 'task_claim' : 'action';
  const isBarred = isGateBarring(caller, holds, { isStarted: candidate.isStarted === true });

  if (isBarred && NIXIE_TEST_BUILD) {
    const reasons = Object.entries(holds)
      .filter(([, isHeld]) => isHeld)
      .map(([reason]) => reason)
      .join(', ');

    throw new Error(
      `a candidate query returned work ${candidate.workID} of task ${candidate.taskID}, which the task gate holds for ${reasons}`,
    );
  }

  return isBarred;
}

type LeaseClaim = Omit<Lease, 'generation'> & { readonly now: number };

// SQLite's upsert returns no row from RETURNING when the conflict's WHERE refuses the update, so a
// held lease reads as a refused claim.
async function upsertLease(tx: Transaction<unknown>, claim: LeaseClaim): Promise<Lease | null> {
  const row = await tx
    .$extendTables<TasksTables>()
    .insertInto('leases')
    .values({
      kind: claim.kind,
      work_id: claim.workID,
      holder: claim.holder,
      expires_at: claim.expiresAt,
      epoch: claim.epoch,
      generation: 1,
    })
    .onConflict((conflict) =>
      conflict
        .columns(['kind', 'work_id'])
        .doUpdateSet((eb) => ({
          holder: eb.ref('excluded.holder'),
          expires_at: eb.ref('excluded.expires_at'),
          epoch: eb.ref('excluded.epoch'),
          generation: eb('leases.generation', '+', 1),
        }))
        .where((eb) =>
          eb.or([eb('leases.holder', 'is', null), eb('leases.expires_at', '<=', claim.now)]),
        ),
    )
    .returning('generation')
    .executeTakeFirst();

  return row === undefined
    ? null
    : {
        kind: claim.kind,
        workID: claim.workID,
        holder: claim.holder,
        generation: row.generation,
        epoch: claim.epoch,
        expiresAt: claim.expiresAt,
      };
}
