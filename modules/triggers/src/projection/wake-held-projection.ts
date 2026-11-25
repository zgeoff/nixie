import type { Projection } from '@heynixie/log';
import { triggerMailWokeCodec } from '@heynixie/tasks';
import { triggerMailArrivedCodec } from '../record/trigger-mail-arrived-codec';
import { triggerWakeRuleEndedCodec } from '../record/trigger-wake-rule-ended-codec';
import type { TriggersTables } from '../types';
import { buildHeldKey } from '../wake/build-held-key';

// One row per match that waits for a later wake: an arrival's held match adds it, and a wake that
// shows the mail, or the end of a rule that releases it, drops it.
export const wakeHeldProjection: Projection = {
  table: 'wake_held',
  keyColumn: 'held_key',
  fold: async (tx, record) => {
    const db = tx.$extendTables<TriggersTables>();

    if (record.kind === triggerMailArrivedCodec.kind) {
      const arrived = triggerMailArrivedCodec.decode(record.payload);
      const held = arrived.matches.filter((match) => match.isHeld);

      for (const match of held) {
        await db
          .insertInto('wake_held')
          .values({
            held_key: buildHeldKey(match.ruleID, record.sequence),
            rule_id: match.ruleID,
            target_task_id: match.targetTaskID,
            arrived_seq: record.sequence,
          })
          .onConflict((conflict) => conflict.doNothing())
          .execute();
      }

      return held.map((match) => buildHeldKey(match.ruleID, record.sequence));
    }

    if (record.kind === triggerMailWokeCodec.kind) {
      const woke = triggerMailWokeCodec.decode(record.payload);

      const keys = woke.rules.flatMap((rule) =>
        woke.mails.map((mail) => buildHeldKey(rule.ruleID, mail.arrived)),
      );

      if (keys.length > 0) {
        await db.deleteFrom('wake_held').where('held_key', 'in', keys).execute();
      }

      return keys;
    }

    if (record.kind === triggerWakeRuleEndedCodec.kind) {
      const ended = triggerWakeRuleEndedCodec.decode(record.payload);
      const keys = ended.released.map((sequence) => buildHeldKey(ended.ruleID, sequence));

      if (keys.length > 0) {
        await db.deleteFrom('wake_held').where('held_key', 'in', keys).execute();
      }

      return keys;
    }

    return [];
  },
};
