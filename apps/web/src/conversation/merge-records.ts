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

  return {
    records: toReadableSummaries(
      kept.map((record) => (forgotten.has(record.sequence) ? toForgottenRecord(record) : record)),
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
function toForgottenRecord(record: LiveRecord): LiveRecord {
  const { message: _message, toolCall, ...rest } = record;

  if (toolCall === undefined) {
    return { ...rest, isRemoved: true };
  }

  const { input: _input, content: _content, ...kept } = toolCall;

  return { ...rest, toolCall: kept, isRemoved: true };
}
