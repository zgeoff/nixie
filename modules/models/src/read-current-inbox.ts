import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';

// Reads each of a step's inbox records again by its sequence, oldest first. A step reads its inbox
// before it waits for the turn, so a forget that deleted a record's key in the meantime reaches the
// turn as a forgotten record and never as the text the first read decrypted.
export function readCurrentInbox(
  context: Pick<TasksContext, 'log'>,
  inbox: readonly LogRecord[],
): Promise<readonly LogRecord[]> {
  return Promise.all(
    inbox.map(async (record) => {
      const [entry] = await readRecords(context.log, {
        afterSequence: record.sequence - 1,
        limit: 1,
      });

      return entry?.record.sequence === record.sequence ? entry.record : record;
    }),
  );
}
