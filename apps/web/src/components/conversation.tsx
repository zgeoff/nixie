import type { ReactNode } from 'react';
import { useConversationPage } from '../use-conversation-page';
import type { LiveRecord } from '../use-live-records';
import { useLiveRecords } from '../use-live-records';
import { useOutbox } from '../use-outbox';
import { Composer } from './composer';
import { OutboxItem } from './outbox-item';
import { RecordItem } from './record-item';

export interface ConversationProps {
  readonly thread: string;
}

// The conversation: the page the API returned, the records the live stream adds after it, and
// the messages this device sent that the conversation does not show yet.
export function Conversation(props: ConversationProps): ReactNode {
  const page = useConversationPage(props.thread);
  const liveRecords = useLiveRecords(props.thread, page.data?.readAtSequence);
  const outbox = useOutbox();

  if (page.isPending) {
    return <p>Loading the conversation…</p>;
  }
  if (page.isError) {
    return <p role="alert">The conversation did not load. Reload the page to try again.</p>;
  }

  const records = mergeRecords(page.data.records, liveRecords);
  const shown = new Set(records.map((record) => record.message?.clientMessageId));

  return (
    <main>
      <ol aria-label="Conversation">
        {records.map((record) => (
          <RecordItem key={record.sequence} record={record} />
        ))}
        {outbox.entries
          .filter((entry) => !shown.has(entry.message.clientMessageId))
          .map((entry) => (
            <OutboxItem entry={entry} key={entry.message.clientMessageId} onRetry={outbox.retry} />
          ))}
      </ol>
      <Composer
        onSend={(message) => {
          outbox.add({ ...message, clientMessageId: crypto.randomUUID(), thread: props.thread });
        }}
      />
    </main>
  );
}

// The page and the live stream can both hold a record, so each sequence shows once, in order.
function mergeRecords(
  page: readonly LiveRecord[],
  live: readonly LiveRecord[],
): readonly LiveRecord[] {
  const bySequence = new Map(
    [...page, ...live].map((record) => [record.sequence, record] as const),
  );

  return [...bySequence.values()].toSorted((left, right) => left.sequence - right.sequence);
}
