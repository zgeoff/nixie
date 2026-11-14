import type { TurnInputsContext } from '../types';
import { getTurnInputsDB } from '../utils/get-turn-inputs-db';
import type { ForgetScope } from './pick-forgotten-inputs';
import { pickForgottenInputs } from './pick-forgotten-inputs';
import { removableStates, removeTurnInput } from './remove-turn-input';

// Removes the requests a forget covers, in every state that holds a key or a file. It throws when a
// removal failed, so the forget's cleanup fails and its rerun finishes the work.
export async function removeForgottenInputs(
  ctx: TurnInputsContext,
  scope: ForgetScope,
): Promise<void> {
  const failed = await ctx.lane.run(async () => {
    const rows = await getTurnInputsDB(ctx.log)
      .selectFrom('turn_inputs')
      .select(['input_id', 'key_id', 'state', 'task_id', 'intake_sequence'])
      .where('state', 'in', removableStates)
      .execute();

    let count = 0;

    for (const row of pickForgottenInputs(rows, scope)) {
      try {
        await removeTurnInput(ctx, row, 'forget');
      } catch {
        count += 1;

        ctx.logger('turn_input.remove_failed', { reason: 'forget' }, 'warn');
      }
    }

    return count;
  });

  if (failed > 0) {
    throw new Error(`${String(failed)} logged requests could not be removed`);
  }
}
