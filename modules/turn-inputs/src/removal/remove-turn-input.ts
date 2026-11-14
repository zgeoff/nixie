import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { removeRecordKey, withWriteTransaction } from '@heynixie/log';
import type { TurnInputsContext } from '../types';
import type { InputRemovedCause, InputState, TurnInputsTables } from '../utils/turn-inputs-tables';

export interface RemovableInput {
  readonly input_id: string;
  readonly key_id: string;
  readonly state: InputState;
}

export const removableStates = ['writing', 'stored', 'missing'] as const;

// Runs in the lane. The key goes first, so the live key store opens nothing of the request from then
// on. Each step is safe to run twice, and a row in `writing` is deleted instead of marked, so a
// rerun intake of the same spool file can insert it again.
export async function removeTurnInput(
  ctx: TurnInputsContext,
  input: RemovableInput,
  cause: InputRemovedCause,
): Promise<void> {
  await removeRecordKey(ctx.log, input.key_id);
  await rm(join(ctx.storeDir, `${input.input_id}.bin`), { force: true });
  await rm(join(ctx.storeDir, `${input.input_id}.bin.tmp`), { force: true });

  await withWriteTransaction(ctx.log.writer, async (tx) => {
    const db = tx.$extendTables<TurnInputsTables>();

    if (input.state === 'writing') {
      await db.deleteFrom('turn_inputs').where('input_id', '=', input.input_id).execute();

      return;
    }

    await db
      .updateTable('turn_inputs')
      .set({ state: 'removed', removed_cause: cause })
      .where('input_id', '=', input.input_id)
      .where('state', 'in', removableStates)
      .execute();
  });
}
