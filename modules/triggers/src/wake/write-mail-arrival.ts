import { buildTransactionLog, writeRecordsInTransaction } from '@heynixie/log';
import { writeInboxRecordsInTransaction } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import {
  mailArrivedFieldsSchema,
  triggerMailArrivedCodec,
} from '../record/trigger-mail-arrived-codec';
import type {
  MailArrivalEvent,
  TextArrivalEvent,
  TriggerCoreContext,
  TriggersTables,
} from '../types';
import { buildSourceKey } from '../utils/build-source-key';
import type { WokeMail } from './build-mail-woke-input';
import { buildMailWokeInput } from './build-mail-woke-input';
import { buildMailboxKey } from './build-mailbox-key';
import { buildTargetTaskID } from './build-target-task-id';
import { collectArrivalMatches } from './collect-arrival-matches';
import { endRulesOfEndedTasks } from './end-rules-of-ended-tasks';
import { pickArrivalPlan } from './pick-arrival-plan';
import { pickMailboxSource } from './pick-mailbox-source';
import { readLiveWakeRules } from './read-live-wake-rules';
import type { StoredTextFields } from './text-sources';
import { textSources } from './text-sources';

// One mail arrival in the deliver transaction. It is dropped when its key is held, its mailbox is not
// its source's, or no rule takes it. Otherwise the core writes one arrival record, and one wake for
// each target with a ready rule. Returns false when it wrote no arrival record.
export async function writeMailArrival(
  tx: Transaction<unknown>,
  core: TriggerCoreContext,
  sourceID: string,
  event: MailArrivalEvent | TextArrivalEvent,
): Promise<boolean> {
  const sourceKey = buildSourceKey(sourceID, event.dedupeKey);

  const key = await tx
    .$extendTables<TriggersTables>()
    .selectFrom('trigger_keys')
    .select('source_key')
    .where('source_key', '=', sourceKey)
    .executeTakeFirst();

  if (key !== undefined || !isMailboxOfSource(event, sourceID)) {
    return false;
  }

  const live = await readLiveWakeRules(tx, event.mailbox);

  const matches = collectArrivalMatches(live, event.payload);

  const ended = await endRulesOfEndedTasks(tx, core, [
    ...new Set(matches.map((match) => buildTargetTaskID(match.rule.target))),
  ]);

  const kept = matches.filter((match) => !ended.has(buildTargetTaskID(match.rule.target)));

  if (kept.length === 0) {
    return false;
  }

  const plan = pickArrivalPlan(kept, core.clock.now());

  // A text that its feature forgot, or began to forget, since the source read it wakes nothing and
  // leaves no copy: the arrival takes the sender and body that the feature holds now.
  const held = event.kind === 'text' ? await readHeldText(tx, core, event) : null;

  if (event.kind === 'text' && held === null) {
    return false;
  }

  const mail = {
    ...toArrivalFields(event),
    ...(held === null ? {} : { from: held.from, body: held.body }),
  };

  const [arrived] = await writeRecordsInTransaction(tx, core.log, [
    {
      kind: triggerMailArrivedCodec.kind,
      definitions: core.definitions(),
      payload: triggerMailArrivedCodec.encode({
        source: sourceID,
        dedupeKey: event.dedupeKey,
        mailbox: buildMailboxKey(event.mailbox),
        messageID: mail.messageID,
        threadID: mail.threadID,
        receivedAt: mail.receivedAt,
        matches: plan.flatMap((target) =>
          target.rules.map((rule) => ({
            ruleID: rule.ruleID,
            targetTaskID: target.targetTaskID,
            isHeld: !target.isNow,
          })),
        ),
      }),
      erasable: mailArrivedFieldsSchema.parse({
        from: mail.from,
        subject: mail.subject,
        ...(mail.body === undefined ? {} : { body: mail.body }),
      }),
    },
  ]);

  if (arrived === undefined) {
    throw new Error('the log wrote no record for the arrival');
  }

  await tx
    .$extendTables<TriggersTables>()
    .insertInto('wake_arrival_cleanup')
    .values({ arrived_seq: arrived.sequence })
    .execute();

  const now = plan.filter((target) => target.isNow);

  if (now.length > 0) {
    await writeInboxRecordsInTransaction(
      tx,
      core,
      now.map((target) =>
        buildMailWokeInput(core, {
          targetTaskID: target.targetTaskID,
          rules: target.rules,
          mails: [{ ...mail, arrived: arrived.sequence }],
        }),
      ),
    );
  }

  return true;
}

// A mail source takes the mailbox of its own kind, and a text source the mailbox of its own ID,
// which a feature filled in the core's list of text sources.
function isMailboxOfSource(event: MailArrivalEvent | TextArrivalEvent, sourceID: string): boolean {
  return event.kind === 'mail'
    ? event.mailbox.kind !== 'source' && pickMailboxSource(event.mailbox) === sourceID
    : event.mailbox.sourceID === sourceID && textSources.has(sourceID);
}

function readHeldText(
  tx: Transaction<unknown>,
  core: TriggerCoreContext,
  event: TextArrivalEvent,
): Promise<StoredTextFields | null> {
  const source = textSources.findSource(event.mailbox.sourceID);

  return source === null
    ? Promise.resolve(null)
    : source.readFields(buildTransactionLog(core.log, tx), event.payload.messageID);
}

// A text has no thread and no subject, and its body takes their place in the wake.
function toArrivalFields(event: MailArrivalEvent | TextArrivalEvent): Omit<WokeMail, 'arrived'> {
  const mailbox = buildMailboxKey(event.mailbox);

  if (event.kind === 'mail') {
    return { mailbox, ...event.payload };
  }

  return {
    mailbox,
    messageID: event.payload.messageID,
    threadID: '',
    receivedAt: event.payload.receivedAt,
    from: event.payload.from,
    subject: '',
    body: event.payload.body,
  };
}
