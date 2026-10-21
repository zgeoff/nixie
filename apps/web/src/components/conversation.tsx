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

  readonly navigation?: ReactNode;
}

const layout = css({ display: 'flex', flexDirection: 'column', height: '100dvh' });
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

export function Conversation(props: ConversationProps): ReactNode {
  const conversation = useConversationRecords(props.thread);

  const outbox = useOutbox(conversation.forgottenClientMessageIDs, {
    resetSequence: conversation.liveResetSequence,
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

const notice = css({
  color: 'textMuted',
  fontSize: 'sm',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '2',
  paddingInline: '4',
  width: 'full',
});

function LiveUpdatesNotice(): ReactNode {
  return (
    <p className={notice} role="status">
      Live updates unavailable
    </p>
  );
}
