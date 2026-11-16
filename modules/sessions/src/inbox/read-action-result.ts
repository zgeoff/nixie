import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import type { ToolImage } from '@heynixie/tools';
import type { ActionResultBlock } from './render-action-result';
import { renderActionResult } from './render-action-result';

// The result record that the outcome of an action ran inside the turn names, or null for any other
// record.
export async function readActionResult(
  context: Pick<TasksContext, 'log'>,
  record: LogRecord,
  images: readonly ToolImage[] = [],
): Promise<ActionResultBlock | null> {
  const sequence = record.kind === 'action.outcome' ? record.payload['resultSequence'] : undefined;

  if (typeof sequence !== 'number') {
    return null;
  }

  const [entry] = await readRecords(context.log, { afterSequence: sequence - 1, limit: 1 });

  return entry?.record.kind === 'tool_result' && entry.record.sequence === sequence
    ? renderActionResult(entry.record, images)
    : null;
}
