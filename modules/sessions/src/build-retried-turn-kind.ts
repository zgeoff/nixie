import type { Log, LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { conversationTaskID, taskStepErroredCodec } from '@heynixie/tasks';
import type { EventKind, NotedEvent } from './types';

export interface RetriedTurn {
  readonly message: string | null;
}

const readLimit = 1000;

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
        taskStepErroredCodec.tryDecodePartial(entry.record.payload)?.nextState === 'ready'
          ? [buildRetriedTurn(entry.record)]
          : [],
      );
    },
    render: (detail) =>
      detail.message === null
        ? 'One of your turns failed and was retried.'
        : `One of your turns failed and was retried: "${detail.message}".`,
  };
}

function buildRetriedTurn(record: LogRecord): NotedEvent<RetriedTurn> {
  const message =
    record.erasable.status === 'readable' ? record.erasable.fields['message'] : undefined;

  return {
    sequence: record.sequence,
    at: record.recordedAt.getTime(),
    detail: { message: typeof message === 'string' ? message : null },
  };
}
