import { buildTransactionLog, readRecords, withWriteTransaction } from '@heynixie/log';
import { writeInboxRecordsInTransaction } from '@heynixie/tasks';
import {
  mailArrivedFieldsSchema,
  triggerMailArrivedCodec,
} from '../record/trigger-mail-arrived-codec';
import type { TriggerCoreContext, TriggersTables } from '../types';
import { buildMailWokeInput } from './build-mail-woke-input';
import type { WokeMail } from './build-mail-woke-input';
import { collectLiveHeld } from './collect-live-held';
import { collectReadyWakes } from './collect-ready-wakes';
import { endRulesOfEndedTasks } from './end-rules-of-ended-tasks';
import { parseMailboxKey } from './parse-mailbox-key';
import { readHeldWakeRules } from './read-held-wake-rules';
import { removeSpentArrivalKeys } from './remove-spent-arrival-keys';
import type { TransactionLog } from './text-sources';
import { textSources } from './text-sources';

export interface WakeFlushOptions {
  // The IDs of the sources of connection mailboxes that run. A held match of a connection at a
  // source that does not run stays held, and wakes once the source runs again.
  readonly liveSources: readonly string[];
}

// One tick of the flush: ends the rules of ended tasks, wakes each target with a ready match once,
// and removes the keys that no held match needs. It decides inside the write transaction that writes
// the wakes, so a concurrent arrival cannot wake a rule twice in its window. Returns the wakes written.
export async function runWakeFlush(
  core: TriggerCoreContext,
  options: WakeFlushOptions,
): Promise<number> {
  await removeSpentArrivalKeys(core);

  const held = await core.log.writer.db
    .$extendTables<TriggersTables>()
    .selectFrom('wake_held')
    .select('arrived_seq')
    .execute();

  if (held.length === 0) {
    return 0;
  }

  const written = await withWriteTransaction(core.log.writer, async (tx) => {
    const db = tx.$extendTables<TriggersTables>();

    const targets = await db.selectFrom('wake_held').select('target_task_id').execute();

    await endRulesOfEndedTasks(tx, core, [...new Set(targets.map((row) => row.target_task_id))]);

    const allRows = await db.selectFrom('wake_held').selectAll().orderBy('arrived_seq').execute();
    const rules = await readHeldWakeRules(tx, [...new Set(allRows.map((row) => row.rule_id))]);

    // A match on a text source that is off stays held, and wakes its target once the source is on.
    const rows = allRows.filter((row) => {
      const mailbox = rules.get(row.rule_id)?.rule.mailbox;

      return mailbox?.kind !== 'source' || textSources.has(mailbox.sourceID);
    });

    // Read in this transaction, so an arrival whose text was forgotten after the flush began
    // reaches no wake.
    const arrivals = await readArrivals(buildTransactionLog(core.log, tx), [
      ...new Set(rows.map((row) => row.arrived_seq)),
    ]);

    const wakes = collectReadyWakes(
      collectLiveHeld(
        rows.map((row) => ({
          ruleID: row.rule_id,
          targetTaskID: row.target_task_id,
          arrivedSeq: row.arrived_seq,
        })),
        rules,
        options.liveSources,
      ),
      rules,
      core.clock.now(),
    );

    // A target's mail and its texts wake it apart, because a wake renders as one kind.
    const inputs = wakes.flatMap((wake) => {
      const mails = wake.arrived.flatMap((sequence) => arrivals.get(sequence) ?? []);

      return [true, false].flatMap((isText) => {
        const kind = mails.filter((mail) => isTextMailbox(mail.mailbox) === isText);

        return kind.length === 0
          ? []
          : [
              buildMailWokeInput(core, {
                targetTaskID: wake.targetTaskID,
                rules: wake.rules.filter((rule) => (rule.mailbox.kind === 'source') === isText),
                mails: kind,
              }),
            ];
      });
    });

    await writeInboxRecordsInTransaction(tx, core, inputs);

    return inputs.length;
  });

  await removeSpentArrivalKeys(core);

  return written;
}

// The arrival records that the wakes show, with the sender and subject read back from their
// erasable fields. An arrival whose fields are gone, or whose text its feature forgot, is left out.
async function readArrivals(
  log: TransactionLog,
  sequences: readonly number[],
): Promise<ReadonlyMap<number, WokeMail>> {
  const records = await readRecords(log, {
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

    if (!(await probeTextHeld(log, arrived.mailbox, arrived.messageID))) {
      continue;
    }

    arrivals.set(record.sequence, {
      arrived: record.sequence,
      mailbox: arrived.mailbox,
      messageID: arrived.messageID,
      threadID: arrived.threadID,
      receivedAt: arrived.receivedAt,
      from: fields.from,
      subject: fields.subject,
      ...(fields.body === undefined ? {} : { body: fields.body }),
    });
  }

  return arrivals;
}

// Whether the arrival is a mail, or a text that its feature still holds.
async function probeTextHeld(
  log: TransactionLog,
  mailbox: string,
  messageID: string,
): Promise<boolean> {
  const parsed = parseMailboxKey(mailbox);

  if (parsed.kind !== 'source') {
    return true;
  }

  const held = await textSources.findSource(parsed.sourceID)?.readFields(log, messageID);

  return held !== null && held !== undefined;
}

function isTextMailbox(mailbox: string): boolean {
  return parseMailboxKey(mailbox).kind === 'source';
}
