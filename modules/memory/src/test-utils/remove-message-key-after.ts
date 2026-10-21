import type { Log } from '@heynixie/log';
import { removeRecordKey } from '@heynixie/log';
import type { ScriptedModel } from '@heynixie/testing';
import { waitForCondition } from '@heynixie/testing';

export interface RemovalWiring {
  readonly log: Log;
  readonly model: ScriptedModel;
}

export interface KeyRemoval {
  readonly sequence: number | undefined;

  readonly requests: number;
}

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
