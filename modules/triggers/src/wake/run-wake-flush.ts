import { readRecords, withWriteTransaction } from '@heynixie/log';
import { writeInboxRecordsInTransaction } from '@heynixie/tasks';
import {
  mailArrivedFieldsSchema,
  triggerMailArrivedCodec,
} from '../record/trigger-mail-arrived-codec';
import type { TriggerCoreContext, TriggersTables } from '../types';
import { buildMailWokeInput } from './build-mail-woke-input';
import type { WokeMail } from './build-mail-woke-input';
import { collectReadyWakes } from './collect-ready-wakes';
import { endRulesOfEndedTasks } from './end-rules-of-ended-tasks';
import { readHeldWakeRules } from './read-held-wake-rules';
import { removeSpentArrivalKeys } from './remove-spent-arrival-keys';

// One tick of the flush: ends the rules of ended tasks, wakes each target with a ready match once,
// and removes the keys that no held match needs. It decides inside the write transaction that writes
// the wakes, so a concurrent arrival cannot wake a rule twice in its window. Returns the wakes written.
export async function runWakeFlush(core: TriggerCoreContext): Promise<number> {
  await removeSpentArrivalKeys(core);

  const held = await core.log.writer.db
    .$extendTables<TriggersTables>()
    .selectFrom('wake_held')
    .select('arrived_seq')
    .execute();

  if (held.length === 0) {
    return 0;
  }

  const arrivals = await readArrivals(core, [...new Set(held.map((row) => row.arrived_seq))]);

  const written = await withWriteTransaction(core.log.writer, async (tx) => {
    const db = tx.$extendTables<TriggersTables>();

    const targets = await db.selectFrom('wake_held').select('target_task_id').execute();

    await endRulesOfEndedTasks(tx, core, [...new Set(targets.map((row) => row.target_task_id))]);

    const rows = await db.selectFrom('wake_held').selectAll().orderBy('arrived_seq').execute();
    const rules = await readHeldWakeRules(tx, [...new Set(rows.map((row) => row.rule_id))]);

    const wakes = collectReadyWakes(
      rows.map((row) => ({
        ruleID: row.rule_id,
        targetTaskID: row.target_task_id,
        arrivedSeq: row.arrived_seq,
      })),
      rules,
      core.clock.now(),
    );

    const inputs = wakes.flatMap((wake) => {
      const mails = wake.arrived.flatMap((sequence) => arrivals.get(sequence) ?? []);

      return mails.length === 0
        ? []
        : [buildMailWokeInput(core, { targetTaskID: wake.targetTaskID, rules: wake.rules, mails })];
    });

    await writeInboxRecordsInTransaction(tx, core, inputs);

    return inputs.length;
  });

  await removeSpentArrivalKeys(core);

  return written;
}

// The arrival records that the wakes show, with the sender and subject read back from their
// erasable fields. An arrival whose fields are gone is left out.
async function readArrivals(
  core: TriggerCoreContext,
  sequences: readonly number[],
): Promise<ReadonlyMap<number, WokeMail>> {
  const records = await readRecords(core.log, {
    afterSequence: 0,
    sequences,
    limit: sequences.length,
  });

  const arrivals = new Map<number, WokeMail>();

  for (const entry of records) {
    const record = entry.record;

    if (record.kind !== triggerMailArrivedCodec.kind || record.erasable.status !== 'readable') {
      continue;
    }

    const arrived = triggerMailArrivedCodec.decode(record.payload);
    const fields = mailArrivedFieldsSchema.parse(record.erasable.fields);

    arrivals.set(record.sequence, {
      arrived: record.sequence,
      messageID: arrived.messageID,
      threadID: arrived.threadID,
      receivedAt: arrived.receivedAt,
      from: fields.from,
      subject: fields.subject,
    });
  }

  return arrivals;
}
