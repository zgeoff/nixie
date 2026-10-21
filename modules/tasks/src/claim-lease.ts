import { withWriteTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { Lease, LeaseKind, TasksContext, TasksTables } from './types';
import { waitAtFaultPoint } from './wait-at-fault-point';

export interface ClaimRequest {
  readonly kind: LeaseKind;
  readonly holder: string;
  readonly durationMs: number;

  readonly readCandidate: (tx: Transaction<unknown>, now: number) => Promise<string | null>;

  readonly onClaim?: (tx: Transaction<unknown>, lease: Lease) => Promise<void>;
}

export async function claimLease(
  context: Pick<TasksContext, 'clock' | 'log'>,
  request: ClaimRequest,
): Promise<Lease | null> {
  const lease = await withWriteTransaction(context.log.writer, async (tx) => {
    const now = context.clock.now();

    const workID = await request.readCandidate(tx, now);

    if (workID === null) {
      return null;
    }

    const held = await upsertLease(tx, {
      kind: request.kind,
      workID,
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
