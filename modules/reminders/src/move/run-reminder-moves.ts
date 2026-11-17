import { withWriteTransaction } from '@heynixie/log';
import type { TriggersTables } from '@heynixie/triggers';
import { writeTriggerArming } from '@heynixie/triggers';
import type { Transaction } from 'kysely';
import { writeReminderSet } from '../reminder/write-reminder-set';
import type { RemindersContext, RemindersTables } from '../types';
import type { ReminderMove } from './read-reminder-moves';
import { readReminderMoves } from './read-reminder-moves';

export type SettleMovedDefinition = (tx: Transaction<unknown>, move: ReminderMove) => Promise<void>;

// Turns each staged definition into a reminder in one transaction per definition: the reminder, the
// settle of its runtime change, the withdraw of its old trigger and the removal of its staging row.
// A crash leaves a definition whole or staged, so a second run writes nothing.
export async function runReminderMoves(
  context: Pick<RemindersContext, 'log' | 'definitions'>,
  settleMovedDefinition: SettleMovedDefinition,
): Promise<number> {
  const moves = await withWriteTransaction(context.log.writer, (tx) => readReminderMoves(tx));

  for (const move of moves) {
    await withWriteTransaction(context.log.writer, async (tx) => {
      const after = await readOldWatermark(tx, move.definitionID);

      await writeReminderSet(tx, context, {
        name: move.name,
        note: move.note,
        trigger: move.trigger,
        origin: 'migration',
        ...(after === undefined ? {} : { after }),
      });

      await settleMovedDefinition(tx, move);

      await tx
        .$extendTables<RemindersTables>()
        .deleteFrom('reminder_moves')
        .where('definition_id', '=', move.definitionID)
        .execute();

      await withdrawOldTrigger(tx, context, move.definitionID);
    });
  }

  return moves.length;
}

async function readOldWatermark(
  tx: Transaction<unknown>,
  definitionID: string,
): Promise<number | undefined> {
  const row = await tx
    .$extendTables<TriggersTables>()
    .selectFrom('trigger_definitions')
    .select('after')
    .where('definition_id', '=', definitionID)
    .executeTakeFirst();

  return row?.after;
}

async function withdrawOldTrigger(
  tx: Transaction<unknown>,
  context: Pick<RemindersContext, 'log' | 'definitions'>,
  definitionID: string,
): Promise<void> {
  const row = await tx
    .$extendTables<TriggersTables>()
    .selectFrom('trigger_definitions')
    .select('definition_hash')
    .where('definition_id', '=', definitionID)
    .executeTakeFirst();

  if (row === undefined || row.definition_hash === null) {
    return;
  }

  await writeTriggerArming(tx, context, { armed: [], withdrawn: [definitionID] });
}
