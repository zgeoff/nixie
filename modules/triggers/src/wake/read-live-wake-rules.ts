import type { Kysely, Transaction } from 'kysely';
import type { Mailbox, TriggersTables, WakeRule } from '../types';
import { buildMailboxKey } from './build-mailbox-key';
import { toWakeRule } from './to-wake-rule';

export interface LiveWakeRule {
  readonly rule: WakeRule;

  // epoch ms of the rule's last wake; null when it never woke
  readonly lastWakeAt: number | null;
}

// Each rule of the mailbox that has not ended, expired or not, with the time of its last wake. A
// rule that expired still matches mail that the host received before it expired.
export async function readLiveWakeRules(
  db: Kysely<unknown> | Transaction<unknown>,
  mailbox: Mailbox,
): Promise<readonly LiveWakeRule[]> {
  const rows = await db
    .$extendTables<TriggersTables>()
    .selectFrom('wake_rules')
    .leftJoin('wake_rule_windows', 'wake_rule_windows.rule_id', 'wake_rules.rule_id')
    .selectAll('wake_rules')
    .select('wake_rule_windows.last_wake_at')
    .where('wake_rules.mailbox', '=', buildMailboxKey(mailbox))
    .where('wake_rules.ended_at', 'is', null)
    .orderBy('wake_rules.created_at', 'desc')
    .orderBy('wake_rules.updated_sequence', 'desc')
    .execute();

  return rows.map((row) => ({ rule: toWakeRule(row), lastWakeAt: row.last_wake_at }));
}
