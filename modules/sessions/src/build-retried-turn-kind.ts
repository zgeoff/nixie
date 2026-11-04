import type { Log, LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { conversationTaskID, taskStepErroredCodec } from '@heynixie/tasks';
import { modelAPIReasonPrefix } from './model-api-reason-prefix';
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

      return records.flatMap((entry) => {
        const payload = taskStepErroredCodec.tryDecodePartial(entry.record.payload);

        return payload?.nextState === 'ready'
          ? [buildRetriedTurn(entry.record, isModelAPIReason(payload.reason))]
          : [];
      });
    },
    render: (detail) =>
      detail.message === null
        ? 'One of your turns failed and was retried.'
        : `One of your turns failed and was retried: "${detail.message}".`,
  };
}

function buildRetriedTurn(record: LogRecord, isTextHidden: boolean): NotedEvent<RetriedTurn> {
  const message =
    record.erasable.status === 'readable' && !isTextHidden
      ? record.erasable.fields['message']
      : undefined;

  return {
    sequence: record.sequence,
    at: record.recordedAt.getTime(),
    detail: { message: typeof message === 'string' ? message : null },
  };
}

// The model API's own error text would read to the model as if the conversation had said it, so a
// turn the model API refused is noted without its text.
function isModelAPIReason(reason: string | undefined): boolean {
  return reason?.startsWith(modelAPIReasonPrefix) === true;
}
