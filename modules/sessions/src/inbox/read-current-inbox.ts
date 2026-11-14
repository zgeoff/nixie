import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';

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
