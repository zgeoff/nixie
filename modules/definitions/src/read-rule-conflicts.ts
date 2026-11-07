import type { Kysely } from 'kysely';
import { readRuleStore } from './read-rule-store';
import type { RuntimeRule } from './types';

// A runtime change conflicts once the definitions move its rule away from the version the change
// was made over, and it stays in force until you resolve the conflict.
export async function readRuleConflicts(db: Kysely<unknown>): Promise<readonly RuntimeRule[]> {
  const store = await readRuleStore(db);

  return store.runtime.filter(
    (change) => (change.base?.hash ?? null) !== (change.beneath?.hash ?? null),
  );
}
