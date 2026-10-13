import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import { useConversationPage } from '../use-conversation-page';
import type { LiveRecord } from '../use-live-records';
import { useLiveRecords } from '../use-live-records';
import { useOutbox } from '../use-outbox';
import { Composer } from './composer';
import { ConversationList } from './conversation-list';
import { ConversationScroller } from './conversation-scroller';

export interface ConversationProps {
  readonly thread: string;
}

// The conversation: the page the API returned, the records the live stream adds after it, and
// the messages this device sent that the conversation does not show yet. Messages stand alone,
// and every other record folds into the step it belongs to.
export function Conversation(props: ConversationProps): ReactNode {
  const page = useConversationPage(props.thread);
  const live = useLiveRecords(props.thread, page.data?.readAtSequence);
  const outbox = useOutbox();
  const [sends, setSends] = useState(0);

  if (page.isPending) {
    return <p>Loading the conversation…</p>;
  }
  if (page.isError) {
    return <p role="alert">The conversation did not load. Reload the page to try again.</p>;
  }

  const records = mergeRecords(page.data.records, live.records);

  return (
    <main className={layout}>
      {live.unavailable ? <LiveUpdatesNotice /> : null}
      <ConversationScroller arrivals={records.length + outbox.entries.length} sends={sends}>
        <ConversationList entries={outbox.entries} onRetry={outbox.retry} records={records} />
      </ConversationScroller>
      <div className={composerBar}>
        <Composer
          onSend={(message) => {
            setSends(sends + 1);
            outbox.add({
              ...message,
              clientMessageId: crypto.randomUUID(),
              thread: props.thread,
              timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
            });
          }}
        />
      </div>
    </main>
  );
}

// The page fills the window: the messages scroll, and the composer stays below them in view.
const layout = css({ display: 'flex', flexDirection: 'column', height: '100dvh' });

const composerBar = css({
  borderTopWidth: '1px',
  paddingBlock: '3',
  '& > form': { marginInline: 'auto', maxWidth: '3xl', paddingInline: '4', width: 'full' },
});

// Sits above the messages while the live stream keeps failing, and goes once it connects again.
function LiveUpdatesNotice(): ReactNode {
  return (
    <p className={notice} role="status">
      Live updates unavailable
    </p>
  );
}

const notice = css({
  color: 'gray.600',
  fontSize: 'sm',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '2',
  paddingInline: '4',
  width: 'full',
});

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
