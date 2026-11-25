import type { Projection } from '@heynixie/log';
import { triggerWakeRuleEndedCodec } from '../record/trigger-wake-rule-ended-codec';
import { triggerWakeRuleSetCodec } from '../record/trigger-wake-rule-set-codec';
import type { TriggersTables } from '../types';
import { toCanonicalJSON } from '../utils/to-canonical-json';

// One row per rule. A replace sets the rule again under its ID and keeps its end, which a live rule
// has none of.
export const wakeRulesProjection: Projection = {
  table: 'wake_rules',
  keyColumn: 'rule_id',
  fold: async (tx, record) => {
    const db = tx.$extendTables<TriggersTables>();

    if (record.kind === triggerWakeRuleEndedCodec.kind) {
      const ended = triggerWakeRuleEndedCodec.decode(record.payload);

      await db
        .updateTable('wake_rules')
        .set({
          ended_at: record.recordedAt.getTime(),
          end_reason: ended.reason,
          updated_sequence: record.sequence,
        })
        .where('rule_id', '=', ended.ruleID)
        .execute();

      return [ended.ruleID];
    }

    if (record.kind !== triggerWakeRuleSetCodec.kind) {
      return [];
    }

    const rule = triggerWakeRuleSetCodec.decode(record.payload);

    const values = {
      short_id: rule.shortID,
      mailbox: rule.mailbox,
      match: toCanonicalJSON(rule.match),
      target_kind: rule.target.kind,
      target_task_id: rule.targetTaskID,
      set_by: rule.setBy,
      expires_at: rule.expiresAt,
      window_ms: rule.windowMs,
      origin: rule.origin,
      created_at: rule.createdAt,
      updated_sequence: record.sequence,
    };

    await db
      .insertInto('wake_rules')
      .values({ rule_id: rule.ruleID, ended_at: null, end_reason: null, ...values })
      .onConflict((conflict) => conflict.column('rule_id').doUpdateSet(values))
      .execute();

    return [rule.ruleID];
  },
};
