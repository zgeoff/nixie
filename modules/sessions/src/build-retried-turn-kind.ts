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
      const [failures, earlier] = await Promise.all([
        readRecords(log, {
          afterSequence: range.after,
          beforeSequence: range.through + 1,
          thread: conversationTaskID,
          kinds: ['task.step_errored'],
          limit: readLimit,
        }),
        readRecords(log, {
          afterSequence: 0,
          beforeSequence: range.after + 1,
          thread: conversationTaskID,
          kinds: ['task.step_errored'],
          limit: 1,
          order: 'newest',
        }),
      ]);

      return collectRetriedTurns(
        failures.map((entry) => entry.record),
        earlier[0]?.record ?? null,
      );
    },
    render: (detail) =>
      detail.message === null
        ? 'One of your turns failed and was retried.'
        : `One of your turns failed and was retried: "${detail.message}".`,
  };
}

function collectRetriedTurns(
  failures: readonly LogRecord[],
  earlier: LogRecord | null,
): NotedEvent<RetriedTurn>[] {
  return failures.flatMap((record, index) => {
    const payload = taskStepErroredCodec.tryDecodePartial(record.payload);
    const previous = index === 0 ? earlier : (failures[index - 1] ?? null);

    const isListed =
      payload?.nextState === 'ready' &&
      isUnrecoveredFailure(record, previous, failures[index + 1] ?? null);

    return isListed ? [buildRetriedTurn(record, isModelAPIReason(payload.reason))] : [];
  });
}

const repeatWindowMs = 60 * 60 * 1000;

// The task counts a step's failures since its last commit, so a count above 1 on a failure, or on
// the failure after it, shows that a retry failed too.
function isUnrecoveredFailure(
  failure: LogRecord,
  previous: LogRecord | null,
  next: LogRecord | null,
): boolean {
  return (
    getErrorCount(failure) > 1 ||
    (next !== null && getErrorCount(next) > 1) ||
    (previous !== null &&
      failure.recordedAt.getTime() - previous.recordedAt.getTime() <= repeatWindowMs)
  );
}

function getErrorCount(failure: LogRecord): number {
  return taskStepErroredCodec.tryDecodePartial(failure.payload)?.errors ?? 1;
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
