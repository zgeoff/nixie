import type { Projection } from '@heynixie/log';
import { triggerMailWokeCodec } from '@heynixie/tasks';
import type { TriggersTables } from '../types';

// One row per rule that woke: the recorded time of its last wake starts its window.
export const wakeRuleWindowsProjection: Projection = {
  table: 'wake_rule_windows',
  keyColumn: 'rule_id',
  fold: async (tx, record) => {
    if (record.kind !== triggerMailWokeCodec.kind) {
      return [];
    }

    const woke = triggerMailWokeCodec.decode(record.payload);
    const lastWakeAt = record.recordedAt.getTime();

    for (const rule of woke.rules) {
      await tx
        .$extendTables<TriggersTables>()
        .insertInto('wake_rule_windows')
        .values({
          rule_id: rule.ruleID,
          last_wake_at: lastWakeAt,
          updated_sequence: record.sequence,
        })
        .onConflict((conflict) =>
          conflict
            .column('rule_id')
            .doUpdateSet({ last_wake_at: lastWakeAt, updated_sequence: record.sequence }),
        )
        .execute();
    }

    return woke.rules.map((rule) => rule.ruleID);
  },
};
