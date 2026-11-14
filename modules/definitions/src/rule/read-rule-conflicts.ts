import type { Kysely } from 'kysely';
import type { RuntimeRule } from '../types';
import { readRuleStore } from '../utils/read-rule-store';
import { isRuleConflict } from './is-rule-conflict';

export async function readRuleConflicts(db: Kysely<unknown>): Promise<readonly RuntimeRule[]> {
  const store = await readRuleStore(db);

  return store.runtime.filter((change) =>
    isRuleConflict(change.base?.hash ?? null, change.beneath?.hash ?? null),
  );
}
