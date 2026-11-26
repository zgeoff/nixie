import type { MailArrivalEvent } from '@heynixie/triggers';
import { buildAbortableContext } from './build-abortable-context';
import { pickReplayStart } from './pick-replay-start';
import { readGmailArrival } from './read-gmail-arrival';
import { readGmailChanges } from './read-gmail-changes';
import { readGmailProfileHistoryID } from './read-gmail-profile-history-id';
import { readGmailReplyRules } from './read-gmail-reply-rules';
import type { GmailConnection, PollRun } from './types';
import { writePollDelivery } from './write-poll-delivery';

// Reads the changes of one connection and delivers them with the cursor in one call. The cursor
// moves only when the delivery commits, so a failed poll reads the same changes again.
export async function runConnectionPoll(
  run: PollRun,
  connection: GmailConnection,
  startedAt: number,
): Promise<void> {
  const live = await run.input.readContext(connection.connectionID);

  if (live === null) {
    return;
  }

  const context = buildAbortableContext(live, run.signal);
  const hosts = run.input.hosts;
  const entry = run.cursor[connection.connectionID];

  if (entry === undefined) {
    const historyID = await readGmailProfileHistoryID(hosts, context);

    await writePollDelivery(run, connection, { historyID, startedAt, events: [], replayed: [] });

    return;
  }

  const replyRules = await readGmailReplyRules(run.input.db, {
    connectionID: connection.connectionID,
    at: startedAt,
  });

  const rewindMs = pickReplayStart(replyRules, entry.replayed);

  const changes = await readGmailChanges(hosts, context, { entry, rewindMs });

  const events: MailArrivalEvent[] = [];

  for (const id of changes.ids) {
    const event = await readGmailArrival(run, { connection, context, id });

    if (event !== null) {
      events.push(event);
    }
  }

  await writePollDelivery(run, connection, {
    historyID: changes.historyID,
    startedAt,
    events,
    replayed: replyRules.map((rule) => rule.ruleID),
  });
}
