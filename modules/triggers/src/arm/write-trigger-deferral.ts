import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { triggerDeferredCodec } from '../record/trigger-deferred-codec';
import type { ArmedContext } from './write-armed-definitions';

export interface TriggerDeferral {
  readonly definitionID: string;

  // epoch milliseconds of the slot
  readonly slotMs: number;

  // epoch milliseconds the hold ends, or null to drop the slot
  readonly untilMs: number | null;
}

// One trigger.deferred record, in the caller's transaction.
export async function writeTriggerDeferral(
  tx: Transaction<unknown>,
  context: ArmedContext,
  deferral: TriggerDeferral,
): Promise<void> {
  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'trigger.deferred',
      definitions: context.definitions(),
      payload: triggerDeferredCodec.encode({
        definitionID: deferral.definitionID,
        slot: new Date(deferral.slotMs).toISOString(),
        until: deferral.untilMs === null ? null : new Date(deferral.untilMs).toISOString(),
      }),
    },
  ]);
}
