import { withWriteTransaction } from '@heynixie/log';
import type { Lease, TasksContext, TasksTables } from './types';
import { waitAtFaultPoint } from './wait-at-fault-point';

export interface LeaseRenewal {
  readonly signal: AbortSignal;
  readonly stop: () => Promise<void>;
}

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
    // A renewal at each third of the lease survives 2 missed renewals, and a dead runner still frees
    // its work within one lease length.
    await context.clock.sleep(loop.durationMs / 3, loop.stopping);

    if (loop.stopping.aborted) {
      return;
    }

    const held = await runRenewal(context, loop);

    renewal.held = held;
  }
}

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
