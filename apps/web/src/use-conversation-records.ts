import { useConversationPage } from './use-conversation-page';
import type { LiveRecord } from './use-live-records';
import { useLiveRecords } from './use-live-records';

export interface ConversationRecords {
  // pending until the first page arrives, and failed when it never does; a read again that fails,
  // such as one that reaches a server restarting after a reset, keeps the page it had
  readonly status: 'pending' | 'failed' | 'ready';
  readonly records: readonly LiveRecord[];

  // the end of the newest step at the time of the page, which the page's records may not reach
  readonly lastStepEnd: LiveRecord | null | undefined;

  // whether the live stream failed several attempts in a row, until it connects again
  readonly unavailable: boolean;

  // the client message IDs of the messages a forget dropped the text of, so the outbox can drop
  // its own copy of their text
  readonly forgottenClientMessageIDs: readonly string[];
}

// The records of a thread: the page the API returned and the records the live stream adds after it.
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
    };
  }

  return {
    status: 'ready',
    records: merged.records,
    lastStepEnd: page.data.lastStepEnd,
    unavailable: live.unavailable,
    forgottenClientMessageIDs: merged.forgottenClientMessageIDs,
  };
}

interface MergedRecords {
  readonly records: readonly LiveRecord[];
  readonly forgottenClientMessageIDs: readonly string[];
}

// The page and the live stream can both hold a record, so each sequence shows once, in order. A
// reset removed every record before its log_reset record, so a page read before the reset shows
// none of them. A forget that arrives after its message drops the message's text.
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
    records: kept.map((record) =>
      forgotten.has(record.sequence) ? toForgottenRecord(record) : record,
    ),
    forgottenClientMessageIDs: kept.flatMap((record) =>
      forgotten.has(record.sequence) && record.message?.clientMessageId !== undefined
        ? [record.message.clientMessageId]
        : [],
    ),
  };
}

function toForgottenRecord(record: LiveRecord): LiveRecord {
  const { message: _forgotten, ...rest } = record;

  return rest;
}
