import { removeRecordKey, withWriteTransaction } from '@heynixie/log';
import type { TriggersTables } from '../types';
import { buildMailboxKey } from './build-mailbox-key';
import { endWakeRuleInTransaction } from './end-wake-rule-in-transaction';
import { readGmailWakeRecords } from './read-gmail-wake-records';
import { releaseHeldInTransaction } from './release-held-in-transaction';
import { removeSpentArrivalKeys } from './remove-spent-arrival-keys';
import type { WakeRuleContext } from './set-wake-rule-in-transaction';

// Ends every rule of one Gmail connection as connection_forgotten, drops the matches they held, and
// destroys the text of the mail that its wakes and arrivals showed. It runs again safely. A wake
// keeps its record, which renders each mail as forgotten once its key is gone.
export async function eraseGmailMailbox(
  context: WakeRuleContext,
  connectionID: string,
): Promise<void> {
  const mailbox = buildMailboxKey({ kind: 'gmail', connectionID });

  await withWriteTransaction(context.log.writer, async (tx) => {
    const rules = await tx
      .$extendTables<TriggersTables>()
      .selectFrom('wake_rules')
      .select(['rule_id', 'ended_at'])
      .where('mailbox', '=', mailbox)
      .execute();

    for (const rule of rules) {
      await (rule.ended_at === null
        ? endWakeRuleInTransaction(tx, context, rule.rule_id, 'connection_forgotten')
        : releaseHeldInTransaction(tx, context, rule.rule_id));
    }
  });

  await removeSpentArrivalKeys(context);

  const wakes = await readGmailWakeRecords(context.log.writer.db, connectionID);

  for (const wake of wakes) {
    if (wake.keyID !== null) {
      await removeRecordKey(context.log, wake.keyID);
    }
  }
}
