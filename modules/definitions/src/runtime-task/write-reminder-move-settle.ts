import type { Definitions, Log } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { definitionSettledCodec } from './definition-settled-codec';

export interface ReminderMoveSettleContext {
  readonly log: Log;
  readonly definitions: () => Definitions;
}

export interface ReminderMoveSettle {
  readonly changeID: string;
  readonly definitionID: string;
}

// Retires the runtime change of a definition that became a reminder, with a null hash: no version of
// the definition stays in force.
export async function writeReminderMoveSettle(
  tx: Transaction<unknown>,
  context: ReminderMoveSettleContext,
  settle: ReminderMoveSettle,
): Promise<void> {
  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: definitionSettledCodec.kind,
      definitions: context.definitions(),
      payload: definitionSettledCodec.encode({
        changeID: settle.changeID,
        definitionID: settle.definitionID,
        outcome: 'retired',
        cause: 'reminder_moved',
        hash: null,
      }),
    },
  ]);
}
