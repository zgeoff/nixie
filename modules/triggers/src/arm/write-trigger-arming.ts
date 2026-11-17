import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { toArmedEntry, triggerArmedCodec } from '../record/trigger-armed-codec';
import type { ArmedDefinition } from '../types';
import type { ArmedContext } from './write-armed-definitions';

export interface TriggerArming {
  readonly armed: readonly ArmedDefinition[];
  readonly withdrawn: readonly string[];
}

// One trigger.armed record that arms, re-arms or withdraws the triggers the caller names, for a
// writer that arms its own triggers in its own transaction.
export async function writeTriggerArming(
  tx: Transaction<unknown>,
  context: ArmedContext,
  change: TriggerArming,
): Promise<void> {
  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'trigger.armed',
      definitions: context.definitions(),
      payload: triggerArmedCodec.encode({
        armed: change.armed.map((definition) => toArmedEntry(definition)),
        withdrawn: [...change.withdrawn],
      }),
    },
  ]);
}
