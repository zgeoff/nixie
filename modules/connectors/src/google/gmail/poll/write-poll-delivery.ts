import { toCursorJSON } from './to-cursor-json';
import type { GmailConnection, PollDelivery, PollRun } from './types';

// Delivers one poll of a connection with the whole cursor, and keeps the cursor once it commits.
export async function writePollDelivery(
  run: PollRun,
  connection: GmailConnection,
  delivery: PollDelivery,
): Promise<void> {
  const cursor = {
    ...run.cursor,
    [connection.connectionID]: { historyID: delivery.historyID, polledAt: delivery.startedAt },
  };

  await run.trigger.deliver({ cursor: toCursorJSON(cursor), events: delivery.events });

  run.cursor = cursor;
}
