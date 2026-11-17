import { mergeRecords } from './merge-records';
import { useConversationPage } from './use-conversation-page';
import { useEarlierRecords } from './use-earlier-records';
import type { LiveRecord, LiveRecordsOptions } from './use-live-records';
import { useLiveRecords } from './use-live-records';

export interface ConversationRecords {
  readonly status: 'pending' | 'failed' | 'ready';
  readonly records: readonly LiveRecord[];

  readonly lastStepEnd: LiveRecord | null | undefined;

  readonly unavailable: boolean;

  readonly forgottenClientMessageIDs: readonly string[];

  readonly liveResetSequence: number | undefined;

  readonly isLinkedMessageFailed: boolean;

  readonly onEarlierRetry: () => void;

  readonly isEarlierLoading: boolean;

  readonly isEarlierFailed: boolean;
}

export interface ConversationRecordsOptions extends LiveRecordsOptions {
  readonly messageID?: string;

  readonly isEarlierWanted?: boolean;
}

export function useConversationRecords(
  thread: string,
  options: ConversationRecordsOptions = {},
): ConversationRecords {
  const page = useConversationPage(thread);
  const live = useLiveRecords(thread, page.data?.readAtSequence, options);

  const earlier = useEarlierRecords({
    isWanted: options.isEarlierWanted,
    messageID: options.messageID,
    page: page.data,
    thread,
  });

  const isLinked = options.messageID !== undefined;
  const merged = mergeRecords([...earlier.records, ...(page.data?.records ?? [])], live.records);

  if (page.data === undefined) {
    return {
      status: page.isPending ? 'pending' : 'failed',
      records: [],
      lastStepEnd: null,
      unavailable: live.unavailable,
      forgottenClientMessageIDs: [],
      liveResetSequence: undefined,
      isLinkedMessageFailed: false,
      onEarlierRetry: earlier.onRetry,
      isEarlierLoading: false,
      isEarlierFailed: false,
    };
  }

  return {
    status: 'ready',
    records: merged.records,
    lastStepEnd: findStepEndAfterReset(page.data.lastStepEnd, merged.records),
    unavailable: live.unavailable,
    forgottenClientMessageIDs: merged.forgottenClientMessageIDs,
    liveResetSequence: live.records.findLast((record) => record.kind === 'log_reset')?.sequence,
    isLinkedMessageFailed: earlier.isFailed && isLinked,
    onEarlierRetry: earlier.onRetry,
    isEarlierLoading: earlier.isLoading,
    isEarlierFailed: earlier.isFailed && !isLinked,
  };
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
