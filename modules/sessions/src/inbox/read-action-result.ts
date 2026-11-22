import { readOutcomeReply } from '@heynixie/actions';
import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import type { ApprovedReply } from '@heynixie/tools';
import type { ActionResultBlock } from './render-action-result';
import { renderActionResult } from './render-action-result';

// The result that an action's outcome reports, or null for any other record. An action ran inside
// the turn names its result record, and the reply of the step that ran the call takes the place of
// what that record kept. An action the runner settled keeps the connector's result on the outcome.
export async function readActionResult(
  context: Pick<TasksContext, 'log'>,
  record: LogRecord,
  reply: ApprovedReply | null,
): Promise<ActionResultBlock | null> {
  if (record.kind !== 'action.outcome') {
    return null;
  }

  const sequence = record.payload['resultSequence'];

  if (typeof sequence !== 'number') {
    if (!hasConnectorResult(record)) {
      return null;
    }

    const connectorReply = await readOutcomeReply(context.log, record);

    return renderActionResult(record, connectorReply);
  }

  const [entry] = await readRecords(context.log, { afterSequence: sequence - 1, limit: 1 });

  return entry?.record.kind === 'tool_result' && entry.record.sequence === sequence
    ? renderActionResult(entry.record, reply)
    : null;
}

// A failed outcome's message already shows in its own line, so only a done outcome's result shows.
// A forgotten result still shows, as forgotten.
function hasConnectorResult(record: LogRecord): boolean {
  if (record.payload['status'] !== 'done') {
    return false;
  }

  return record.erasable.status === 'readable'
    ? 'result' in record.erasable.fields
    : record.erasable.status !== 'none';
}
