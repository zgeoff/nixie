import type { LogRecord } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { writeSessionInvalidated } from '../session/write-session-invalidated';

export function seedSessionInvalidated(
  context: Pick<TasksContext, 'log' | 'definitions'>,
): Promise<LogRecord> {
  return writeSessionInvalidated(context, { itemID: 'item-seeded' });
}
