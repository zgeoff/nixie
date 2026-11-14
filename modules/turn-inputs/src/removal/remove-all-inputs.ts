import type { TurnInputsContext } from '../types';
import { getTurnInputsDB } from '../utils/get-turn-inputs-db';
import { removableStates, removeTurnInput } from './remove-turn-input';

// `--drop`: removes every request, whatever its state. It throws when a removal failed.
export async function removeAllInputs(ctx: TurnInputsContext): Promise<void> {
  const failed = await ctx.lane.run(async () => {
    const rows = await getTurnInputsDB(ctx.log)
      .selectFrom('turn_inputs')
      .select(['input_id', 'key_id', 'state'])
      .where('state', 'in', removableStates)
      .execute();

    let count = 0;

    for (const row of rows) {
      try {
        await removeTurnInput(ctx, row, 'dropped');
      } catch {
        count += 1;

        ctx.logger('turn_input.remove_failed', { reason: 'dropped' }, 'warn');
      }
    }

    return count;
  });

  if (failed > 0) {
    throw new Error(`${String(failed)} logged requests could not be removed`);
  }
}
