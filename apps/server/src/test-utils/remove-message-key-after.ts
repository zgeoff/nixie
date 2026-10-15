import type { Log } from '@heynixie/log';
import { removeRecordKey } from '@heynixie/log';
import type { ScriptedModel } from '@heynixie/testing';
import { waitForCondition } from '@heynixie/testing';

export interface RemovalWiring {
  readonly log: Log;
  readonly model: ScriptedModel;
}

export interface KeyRemoval {
  // the record whose key goes, such as your message a batch cites
  readonly sequence: number | undefined;

  // how many requests the model has before the key goes
  readonly requests: number;
}

// Removes a record's key once the model has the given number of requests, the way a forget of the
// message lands while the model still works on it. Its promise resolves once the key is gone, so a
// scripted reply gated on it answers only after the forget.
export async function removeMessageKeyAfter(
  wiring: RemovalWiring,
  removal: KeyRemoval,
): Promise<void> {
  await waitForCondition(() => wiring.model.requests.length >= removal.requests, {
    timeoutMs: 30_000,
  });

  const row = await wiring.log.writer.db
    .$extendTables<{ records: { sequence: number; key_id: string | null } }>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', removal.sequence ?? -1)
    .executeTakeFirst();

  if (typeof row?.key_id !== 'string') {
    throw new TypeError(`the record ${String(removal.sequence)} has no key`);
  }

  await removeRecordKey(wiring.log, row.key_id);
}
