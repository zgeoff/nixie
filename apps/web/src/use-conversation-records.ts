import { useConversationPage } from './use-conversation-page';
import type { LiveRecord } from './use-live-records';
import { useLiveRecords } from './use-live-records';

export interface ConversationRecords {
  readonly status: 'pending' | 'failed' | 'ready';
  readonly records: readonly LiveRecord[];

  readonly lastStepEnd: LiveRecord | null | undefined;

  readonly unavailable: boolean;

  readonly forgottenClientMessageIDs: readonly string[];

  readonly liveResetSequence: number | undefined;
}

export function useConversationRecords(thread: string): ConversationRecords {
  const page = useConversationPage(thread);
  const live = useLiveRecords(thread, page.data?.readAtSequence);
  const merged = mergeRecords(page.data?.records ?? [], live.records);

  if (page.data === undefined) {
    return {
      status: page.isPending ? 'pending' : 'failed',
      records: [],
      lastStepEnd: null,
      unavailable: live.unavailable,
      forgottenClientMessageIDs: [],
      liveResetSequence: undefined,
    };
  }

  return {
    status: 'ready',
    records: merged.records,
    lastStepEnd: findStepEndAfterReset(page.data.lastStepEnd, merged.records),
    unavailable: live.unavailable,
    forgottenClientMessageIDs: merged.forgottenClientMessageIDs,
    liveResetSequence: live.records.findLast((record) => record.kind === 'log_reset')?.sequence,
  };
}

interface MergedRecords {
  readonly records: readonly LiveRecord[];
  readonly forgottenClientMessageIDs: readonly string[];
}

function mergeRecords(page: readonly LiveRecord[], live: readonly LiveRecord[]): MergedRecords {
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

function toForgottenRecord(record: LiveRecord): LiveRecord {
  const { message: _forgotten, ...rest } = record;

  return rest;
}

function findStepEndAfterReset(
  stepEnd: LiveRecord | null | undefined,
  records: readonly LiveRecord[],
): LiveRecord | null | undefined {
  const reset = records.findLast((record) => record.kind === 'log_reset');
  const sequence = stepEnd?.sequence;

  return reset !== undefined && sequence !== undefined && sequence < reset.sequence
    ? null
    : stepEnd;
}
