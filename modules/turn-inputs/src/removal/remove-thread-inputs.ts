import { closeCaptures } from '../capture/close-captures';
import type { TurnInputsContext } from '../types';
import { getTurnInputsDB } from '../utils/get-turn-inputs-db';
import { removableStates, removeTurnInput } from './remove-turn-input';

// Closes the threads' open captures, then removes every request on them. It throws when a shred or
// a removal failed, so the reset fails and its rerun finishes the work.
export async function removeThreadInputs(
  ctx: TurnInputsContext,
  threads: readonly string[],
): Promise<void> {
  await closeCaptures(ctx, { cause: 'reset', taskIDs: threads });

  const failed = await ctx.lane.run(async () => {
    const rows = await getTurnInputsDB(ctx.log)
      .selectFrom('turn_inputs')
      .select(['input_id', 'key_id', 'state'])
      .where('state', 'in', removableStates)
      .where('task_id', 'in', threads)
      .execute();

    let count = 0;

    for (const row of rows) {
      try {
        await removeTurnInput(ctx, row, 'reset');
      } catch {
        count += 1;

        ctx.logger('turn_input.remove_failed', { reason: 'reset' }, 'warn');
      }
    }

    return count;
  });

  if (failed > 0) {
    throw new Error(`${String(failed)} logged requests could not be removed`);
  }
}
