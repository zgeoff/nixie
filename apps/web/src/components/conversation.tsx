import type { ReactNode } from 'react';
import { useState } from 'react';
import { css } from '../styled-system/css';
import { useConversationRecords } from '../use-conversation-records';
import { useOutbox } from '../use-outbox';
import { CompactionFailureNotice } from './compaction-failure-notice';
import { Composer } from './composer';
import { ConversationFailureNotice } from './conversation-failure-notice';
import { ConversationList } from './conversation-list';
import { ConversationScroller } from './conversation-scroller';
import { ThemePicker } from './theme-picker';

export interface ConversationProps {
  readonly thread: string;

  // the links to the app's other views, which the route supplies
  readonly navigation?: ReactNode;
}

// The conversation: the page the API returned, the records the live stream adds after it, and
// the messages this device sent that the conversation does not show yet. Messages stand alone,
// and every other record folds into the step it belongs to.
export function Conversation(props: ConversationProps): ReactNode {
  const conversation = useConversationRecords(props.thread);

  const outbox = useOutbox(conversation.forgottenClientMessageIDs, {
    resetAt: conversation.records.find((record) => record.kind === 'log_reset')?.recordedAt,
  });

  const [sends, setSends] = useState(0);

  if (conversation.status === 'pending') {
    return <p>Loading the conversation…</p>;
  }

  if (conversation.status === 'failed') {
    return <p role="alert">The conversation did not load. Reload the page to try again.</p>;
  }

  const records = conversation.records;

  return (
    <main className={layout}>
      <header className={header}>
        <div className={headerRow}>
          {props.navigation}
          <ThemePicker />
        </div>
      </header>
      {conversation.unavailable ? <LiveUpdatesNotice /> : null}
      <ConversationFailureNotice lastStepEnd={conversation.lastStepEnd} records={records} />
      <CompactionFailureNotice records={records} />
      <ConversationScroller arrivals={records.length + outbox.entries.length} sends={sends}>
        <ConversationList
          entries={outbox.entries}
          onDiscard={outbox.discard}
          onRetry={outbox.retry}
          records={records}
        />
      </ConversationScroller>
      <div className={composerBar}>
        <Composer
          onSend={(message) => {
            setSends(sends + 1);

            outbox.add({ ...message, clientMessageId: crypto.randomUUID(), thread: props.thread });
          }}
        />
      </div>
    </main>
  );
}

// The page fills the window: the messages scroll, and the composer stays below them in view.
const layout = css({ display: 'flex', flexDirection: 'column', height: '100dvh' });

// A slim bar above the messages that holds the links to other views and the page's settings,
// aligned with the column.
const header = css({ borderBottomWidth: '1px', paddingBlock: '1' });

const headerRow = css({
  alignItems: 'baseline',
  display: 'flex',
  fontSize: 'sm',
  gap: '4',
  justifyContent: 'space-between',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingInline: '4',
  '& > label': { marginInlineStart: 'auto' },
});

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
  color: 'textMuted',
  fontSize: 'sm',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '2',
  paddingInline: '4',
  width: 'full',
});
