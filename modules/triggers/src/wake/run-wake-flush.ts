import { readRecords, withWriteTransaction } from '@heynixie/log';
import { writeInboxRecordsInTransaction } from '@heynixie/tasks';
import {
  mailArrivedFieldsSchema,
  triggerMailArrivedCodec,
} from '../record/trigger-mail-arrived-codec';
import type { TriggerCoreContext, TriggersTables } from '../types';
import { buildHeldKey } from './build-held-key';
import { buildMailWokeInput } from './build-mail-woke-input';
import type { WokeMail } from './build-mail-woke-input';
import { collectReadyWakes } from './collect-ready-wakes';
import { endRulesOfEndedTasks } from './end-rules-of-ended-tasks';
import { readHeldWakeRules } from './read-held-wake-rules';
import { removeSpentArrivalKeys } from './remove-spent-arrival-keys';

// One tick of the flush. It wakes each target that holds a ready match, with every ready match of
// the target in one record, and ends the rules of a target whose task ended. Returns the number of
// wakes written.
export async function runWakeFlush(core: TriggerCoreContext): Promise<number> {
  const db = core.log.writer.db.$extendTables<TriggersTables>();

  const held = await db.selectFrom('wake_held').selectAll().orderBy('arrived_seq').execute();

  if (held.length === 0) {
    return 0;
  }

  const rules = await readHeldWakeRules(core.log.writer.db, [
    ...new Set(held.map((row) => row.rule_id)),
  ]);

  const wakes = collectReadyWakes(
    held.map((row) => ({
      ruleID: row.rule_id,
      targetTaskID: row.target_task_id,
      arrivedSeq: row.arrived_seq,
    })),
    rules,
    core.clock.now(),
  );

  if (wakes.length === 0) {
    return 0;
  }

  const arrivals = await readArrivals(core, [...new Set(wakes.flatMap((wake) => wake.arrived))]);

  const spent: number[] = [];

  const written = await withWriteTransaction(core.log.writer, async (tx) => {
    const ended = await endRulesOfEndedTasks(
      tx,
      core,
      wakes.map((wake) => wake.targetTaskID),
    );

    spent.push(
      ...wakes.filter((wake) => ended.has(wake.targetTaskID)).flatMap((wake) => wake.arrived),
    );

    const inputs = [];

    for (const wake of wakes.filter((entry) => !ended.has(entry.targetTaskID))) {
      const stillHeld = await tx
        .$extendTables<TriggersTables>()
        .selectFrom('wake_held')
        .select('held_key')
        .where(
          'held_key',
          'in',
          wake.rules.flatMap((rule) =>
            wake.arrived.map((sequence) => buildHeldKey(rule.ruleID, sequence)),
          ),
        )
        .execute();

      const heldKeys = new Set(stillHeld.map((row) => row.held_key));

      const mails = wake.arrived.flatMap((sequence) => {
        const arrival = arrivals.get(sequence);
        const isHeld = wake.rules.some((rule) => heldKeys.has(buildHeldKey(rule.ruleID, sequence)));

        return arrival === undefined || !isHeld ? [] : [arrival];
      });

      if (mails.length > 0) {
        inputs.push(
          buildMailWokeInput(core, { targetTaskID: wake.targetTaskID, rules: wake.rules, mails }),
        );

        spent.push(...mails.map((mail) => mail.arrived));
      }
    }

    await writeInboxRecordsInTransaction(tx, core, inputs);

    return inputs.length;
  });

  await removeSpentArrivalKeys(core, spent);

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
