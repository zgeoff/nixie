import type { LiveRecord } from './use-live-records';

export interface MergedRecords {
  readonly records: readonly LiveRecord[];
  readonly forgottenClientMessageIDs: readonly string[];
}

export function mergeRecords(
  page: readonly LiveRecord[],
  live: readonly LiveRecord[],
): MergedRecords {
  const bySequence = new Map(
    [...page, ...live].map((record) => [record.sequence, record] as const),
  );

  const sorted = [...bySequence.values()].toSorted((left, right) => left.sequence - right.sequence);
  const reset = sorted.findLastIndex((record) => record.kind === 'log_reset');
  const kept = reset === -1 ? sorted : sorted.slice(reset);

  const forgotten = new Set(
    kept.flatMap((record) => (record.forget ? [record.forget.sequence] : [])),
  );

  const expired = new Set(kept.flatMap((record) => record.expiry?.sequences ?? []));

  const voided = new Map(
    kept.flatMap((record) =>
      record.voidedReply ? [[record.voidedReply.sequence, record.voidedReply.reason] as const] : [],
    ),
  );

  return {
    records: toReadableSummaries(
      kept.map((record) => {
        if (forgotten.has(record.sequence)) {
          return toRemovedRecord(record, { isRemoved: true });
        }

        if (expired.has(record.sequence)) {
          return toRemovedRecord(record, { isExpired: true });
        }

        const reason = voided.get(record.sequence);

        return reason === undefined ? record : toVoidedReply(record, reason);
      }),
    ),
    forgottenClientMessageIDs: kept.flatMap((record) =>
      forgotten.has(record.sequence) && record.message?.clientMessageId !== undefined
        ? [record.message.clientMessageId]
        : [],
    ),
  };
}

function toReadableSummaries(records: readonly LiveRecord[]): readonly LiveRecord[] {
  const invalidated = records.findLast((record) => record.kind === 'model.session_invalidated');

  if (invalidated === undefined) {
    return records;
  }

  return records.map((record) =>
    record.summary?.text !== undefined &&
    invalidated.sequence > getOpenedBefore(records, record.sequence)
      ? toErasedSummary(record)
      : record,
  );
}

function getOpenedBefore(records: readonly LiveRecord[], sequence: number): number {
  return (
    records.findLast(
      (record) => record.kind === 'model.session_opened' && record.sequence < sequence,
    )?.sequence ?? -1
  );
}

function toErasedSummary(record: LiveRecord): LiveRecord {
  if (record.summary === undefined) {
    return record;
  }

  const { text: _erased, ...summary } = record.summary;

  return { ...record, summary };
}

// The tool's name and outcome stay, so the call still reads as a call that ran.
function toRemovedRecord(
  record: LiveRecord,
  mark: { readonly isRemoved: true } | { readonly isExpired: true },
): LiveRecord {
  const { message: _message, toolCall, task, worker, ...rest } = record;
  const withWorker = worker === undefined ? rest : { ...rest, worker: toWorkerWithoutText(worker) };

  const withTask =
    task === undefined ? withWorker : { ...withWorker, task: toTaskWithoutError(task) };

  if (toolCall === undefined) {
    return { ...withTask, ...mark };
  }

  const { input: _input, content: _content, ...kept } = toolCall;

  return { ...withTask, toolCall: kept, ...mark };
}

function toWorkerWithoutText(
  worker: NonNullable<LiveRecord['worker']>,
): NonNullable<LiveRecord['worker']> {
  if (worker.phase === 'turn') {
    const { text: _text, ...kept } = worker;

    return kept;
  }

  if (worker.phase === 'ended') {
    const { detail: _detail, ...kept } = worker;

    return kept;
  }

  return worker;
}

function toTaskWithoutError(
  task: NonNullable<LiveRecord['task']>,
): NonNullable<LiveRecord['task']> {
  const { error: _error, ...kept } = task;

  return kept;
}

function toVoidedReply(
  record: LiveRecord,
  reason: NonNullable<NonNullable<LiveRecord['message']>['voidReason']>,
): LiveRecord {
  if (record.kind !== 'model.reply' || record.message === undefined) {
    return record;
  }

  return { ...record, message: { ...record.message, isVoided: true, voidReason: reason } };
}
