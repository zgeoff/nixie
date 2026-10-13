import type { Log, LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import type { EventKind, NotedEvent } from './types';

// A conversation turn that threw, which the task runs again, with the error's text when the log
// still holds it.
export interface RetriedTurn {
  readonly message: string | null;
}

// The event kind for a failed conversation turn that the task retried. A failure that ended the
// task is not a retry, so it is left out.
export function buildRetriedTurnKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): EventKind<RetriedTurn> {
  return {
    name: 'retried_turn',
    read: async (range) => {
      const records = await readRecords(log, {
        afterSequence: range.after,
        beforeSequence: range.through + 1,
        thread: conversationTaskID,
        kinds: ['task.step_errored'],
        limit: readLimit,
      });

      return records.flatMap((entry) =>
        entry.record.payload['nextState'] === 'ready' ? [buildRetriedTurn(entry.record)] : [],
      );
    },
    render: (detail) =>
      detail.message === null
        ? 'One of your turns failed and was retried.'
        : `One of your turns failed and was retried: "${detail.message}".`,
  };
}

// the most failures one note reads, past which the block's count of more stops growing
const readLimit = 1000;

function buildRetriedTurn(record: LogRecord): NotedEvent<RetriedTurn> {
  const message =
    record.erasable.status === 'readable' ? record.erasable.fields['message'] : undefined;

  return {
    sequence: record.sequence,
    at: record.recordedAt.getTime(),
    detail: { message: typeof message === 'string' ? message : null },
  };
}
