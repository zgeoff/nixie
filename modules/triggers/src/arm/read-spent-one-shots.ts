import type { Trigger } from '@heynixie/contract';
import type { Kysely } from 'kysely';
import { buildInstantKey } from '../time/build-instant-key';
import type { TriggersTables } from '../types';
import { buildSourceKey } from '../utils/build-source-key';

export interface OneShotCandidate {
  readonly definitionID: string;
  readonly trigger: Trigger;
}

// The IDs of the one-shots whose dedupe key trigger_keys holds: they fired or were skipped.
export async function readSpentOneShots(
  db: Kysely<unknown>,
  candidates: readonly OneShotCandidate[],
): Promise<ReadonlySet<string>> {
  const keys = new Map<string, string>();

  for (const candidate of candidates) {
    if ('at' in candidate.trigger) {
      const dedupeKey = buildInstantKey(candidate.definitionID, Date.parse(candidate.trigger.at));

      keys.set(buildSourceKey('schedule', dedupeKey), candidate.definitionID);
    }
  }

  if (keys.size === 0) {
    return new Set();
  }

  const rows = await db
    .$extendTables<TriggersTables>()
    .selectFrom('trigger_keys')
    .select('source_key')
    .where('source_key', 'in', [...keys.keys()])
    .execute();

  return new Set(rows.flatMap((row) => keys.get(row.source_key) ?? []));
}
