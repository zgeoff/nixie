import { withWriteTransaction } from '@heynixie/log';
import type { TurnInputsContext } from '../types';
import { getTurnInputsDB } from '../utils/get-turn-inputs-db';
import type { TurnInputsTables } from '../utils/turn-inputs-tables';
import { pickRetentionRemovals } from './pick-retention-removals';
import { removableStates, removeTurnInput } from './remove-turn-input';

const defaultRetention = { days: 7, bytes: 2_147_483_648 };

// Runs in the lane, and whether or not the log is on, because rows from an earlier on-period still
// hold request text. A removal that fails is logged and left for the next sweep.
export async function runRetentionSweep(ctx: TurnInputsContext): Promise<void> {
  const retention = ctx.config?.retention ?? defaultRetention;

  const rows = await getTurnInputsDB(ctx.log)
    .selectFrom('turn_inputs')
    .select(['input_id', 'key_id', 'state', 'bytes', 'taken_at'])
    .where('state', 'in', removableStates)
    .execute();

  for (const removal of pickRetentionRemovals(rows, retention, ctx.clock.now())) {
    try {
      await removeTurnInput(ctx, removal.input, removal.cause);
    } catch {
      ctx.logger('turn_input.remove_failed', { reason: removal.cause }, 'warn');
    }
  }

  const cutoff = ctx.clock.now() - retention.days * 86_400_000;

  await withWriteTransaction(ctx.log.writer, (tx) =>
    tx
      .$extendTables<TurnInputsTables>()
      .deleteFrom('turn_input_misses')
      .where('created_at', '<', cutoff)
      .execute(),
  );
}
