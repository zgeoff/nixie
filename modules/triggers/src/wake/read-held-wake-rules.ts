import type { Kysely, Transaction } from 'kysely';
import type { TriggersTables } from '../types';
import type { LiveWakeRule } from './read-live-wake-rules';
import { toWakeRule } from './to-wake-rule';

// The rules that the held matches name, ended or not: a cancelled rule's matches still flush.
export async function readHeldWakeRules(
  db: Kysely<unknown> | Transaction<unknown>,
  ruleIDs: readonly string[],
): Promise<ReadonlyMap<string, LiveWakeRule>> {
  if (ruleIDs.length === 0) {
    return new Map();
  }

  const rows = await db
    .$extendTables<TriggersTables>()
    .selectFrom('wake_rules')
    .leftJoin('wake_rule_windows', 'wake_rule_windows.rule_id', 'wake_rules.rule_id')
    .selectAll('wake_rules')
    .select('wake_rule_windows.last_wake_at')
    .where('wake_rules.rule_id', 'in', [...ruleIDs])
    .execute();

  return new Map(
    rows.map((row) => [row.rule_id, { rule: toWakeRule(row), lastWakeAt: row.last_wake_at }]),
  );
}
