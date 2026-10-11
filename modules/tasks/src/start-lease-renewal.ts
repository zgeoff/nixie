import { withWriteTransaction } from '@heynixie/log';
import type { Lease, TasksContext, TasksTables } from './types';
import { waitAtFaultPoint } from './wait-at-fault-point';

export interface LeaseRenewal {
  // aborts when a renewal finds the lease gone, so the work stops what it can no longer commit
  readonly signal: AbortSignal;
  readonly stop: () => Promise<void>;
}

// Renews a lease every third of its length until stopped. Why: renewing at a third survives 2
// missed renewals, and a dead runner still frees its work within one lease length.
export function startLeaseRenewal(
  context: Pick<TasksContext, 'clock' | 'log'>,
  lease: Lease,
  durationMs: number,
): LeaseRenewal {
  const lost = new AbortController();
  const stopping = new AbortController();
  const loop = runRenewals(context, {
    lease,
    durationMs,
    stopping: stopping.signal,
    onLost: (reason) => {
      lost.abort(reason);
    },
  });

  return {
    signal: lost.signal,
    stop: async () => {
      stopping.abort();
      await loop;
    },
  };
}

interface RenewalLoop {
  readonly lease: Lease;
  readonly durationMs: number;
  readonly stopping: AbortSignal;
  readonly onLost: (reason?: unknown) => void;
}

async function runRenewals(
  context: Pick<TasksContext, 'clock' | 'log'>,
  loop: RenewalLoop,
): Promise<void> {
  const renewal = { held: true };

  while (renewal.held) {
    // oxlint-disable-next-line no-await-in-loop -- one renewal per third of the lease
    await context.clock.sleep(loop.durationMs / 3, loop.stopping);
    if (loop.stopping.aborted) {
      return;
    }

    // oxlint-disable-next-line no-await-in-loop -- each renewal waits for the one before it
    const held = await runRenewal(context, loop);

    renewal.held = held;
  }
}

// one renewal: true while the lease stands, false once it is lost
async function runRenewal(
  context: Pick<TasksContext, 'clock' | 'log'>,
  loop: RenewalLoop,
): Promise<boolean> {
  const faultContext = { kind: loop.lease.kind, id: loop.lease.workID };

  if (NIXIE_TEST_BUILD) {
    await waitAtFaultPoint('renew.before', faultContext);
  }
  const held = await tryUpdateLeaseExpiry(context, loop);

  if (NIXIE_TEST_BUILD && held) {
    await waitAtFaultPoint('renew.after', faultContext);
  }
  return held;
}

// a renewal that finds no lease, or fails, reports the loss and ends the renewals
async function tryUpdateLeaseExpiry(
  context: Pick<TasksContext, 'clock' | 'log'>,
  loop: RenewalLoop,
): Promise<boolean> {
  try {
    const held = await updateLeaseExpiry(context, loop);

    if (!held) {
      loop.onLost();
    }
    return held;
  } catch (error) {
    loop.onLost(error);
    return false;
  }
}

// moves the expiry one lease length past now, only while the lease still stands as claimed
function updateLeaseExpiry(
  context: Pick<TasksContext, 'clock' | 'log'>,
  loop: RenewalLoop,
): Promise<boolean> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const now = context.clock.now();
    const row = await tx
      .$extendTables<TasksTables>()
      .updateTable('leases')
      .set({ expires_at: now + loop.durationMs })
      .where('kind', '=', loop.lease.kind)
      .where('work_id', '=', loop.lease.workID)
      .where('holder', '=', loop.lease.holder)
      .where('generation', '=', loop.lease.generation)
      .where('expires_at', '>', now)
      .returning('generation')
      .executeTakeFirst();

    return row !== undefined;
  });
}
