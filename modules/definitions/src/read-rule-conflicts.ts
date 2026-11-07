import type { Kysely } from 'kysely';
import { isRuleConflict } from './is-rule-conflict';
import { readRuleStore } from './read-rule-store';
import type { RuntimeRule } from './types';

export async function readRuleConflicts(db: Kysely<unknown>): Promise<readonly RuntimeRule[]> {
  const store = await readRuleStore(db);

  return store.runtime.filter((change) =>
    isRuleConflict(change.base?.hash ?? null, change.beneath?.hash ?? null),
  );
}
