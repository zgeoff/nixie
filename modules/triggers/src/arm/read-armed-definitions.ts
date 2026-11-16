import type { Trigger } from '@heynixie/contract';
import { triggerSchema } from '@heynixie/contract';
import type { Kysely } from 'kysely';
import type { TriggersTables } from '../types';

export interface ArmedRow {
  readonly definitionID: string;
  readonly definitionHash: string;
  readonly target: 'task' | 'conversation';
  readonly trigger: Trigger;

  // the watermark, epoch milliseconds
  readonly after: number;
}

// The armed definitions of one source: those that hold a hash.
export async function readArmedDefinitions(
  db: Kysely<unknown>,
  sourceID: string,
): Promise<readonly ArmedRow[]> {
  const rows = await db
    .$extendTables<TriggersTables>()
    .selectFrom('trigger_definitions')
    .select(['definition_id', 'definition_hash', 'target', 'trigger', 'after'])
    .where('source_id', '=', sourceID)
    .where('definition_hash', 'is not', null)
    .orderBy('definition_id')
    .execute();

  return rows.flatMap((row) =>
    row.definition_hash === null
      ? []
      : [
          {
            definitionID: row.definition_id,
            definitionHash: row.definition_hash,
            target: row.target,
            trigger: triggerSchema.parse(JSON.parse(row.trigger)),
            after: row.after,
          },
        ],
  );
}
