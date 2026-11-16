import type { Definitions, Log } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { DefinitionsTables } from '../types';
import { definitionSettledCodec } from './definition-settled-codec';

export interface OneShotSettleContext {
  readonly log: Log;
  readonly definitions: () => Definitions;
}

export interface OneShotSettle {
  readonly definitionID: string;
  readonly cause: 'one_shot_fired' | 'one_shot_skipped';
}

// The runtime half of retiring a spent one-shot: a definition with a runtime change in force
// settles it as retired with a null hash. The withdraw of the trigger core runs beside it.
export async function writeOneShotSettle(
  tx: Transaction<unknown>,
  context: OneShotSettleContext,
  settle: OneShotSettle,
): Promise<void> {
  const change = await tx
    .$extendTables<DefinitionsTables>()
    .selectFrom('runtime_task_definitions')
    .select('change_id')
    .where('definition_id', '=', settle.definitionID)
    .where('state', '=', 'in_force')
    .executeTakeFirst();

  if (change === undefined) {
    return;
  }

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: definitionSettledCodec.kind,
      definitions: context.definitions(),
      payload: definitionSettledCodec.encode({
        changeID: change.change_id,
        definitionID: settle.definitionID,
        outcome: 'retired',
        cause: settle.cause,
        hash: null,
      }),
    },
  ]);
}
