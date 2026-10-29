import type { ReactNode } from 'react';
import { useState } from 'react';
import type { StartTimer } from '../start-platform-timer';
import { css } from '../styled-system/css';
import { useConversationRecords } from '../use-conversation-records';
import { useMemoryNotices } from '../use-memory-notices';
import { useOutbox } from '../use-outbox';
import { CompactionFailureNotice } from './compaction-failure-notice';
import { Composer } from './composer';
import { ConversationFailureNotice } from './conversation-failure-notice';
import { ConversationList } from './conversation-list';
import { ConversationScroller } from './conversation-scroller';
import { ThemePicker } from './theme-picker';
import { VoiceTypingControl } from './voice-typing-control';

export interface ConversationProps {
  readonly thread: string;

  readonly navigation?: ReactNode;

  readonly startTimer?: StartTimer;
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
});

const headerControls = css({
  alignItems: 'baseline',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '4',
  justifyContent: 'end',
  marginInlineStart: 'auto',
});

const composerBar = css({
  borderTopWidth: '1px',
  paddingBlock: '3',
  '& > form': { marginInline: 'auto', maxWidth: '3xl', paddingInline: '4', width: 'full' },
});

export function Conversation(props: ConversationProps): ReactNode {
  const liveOptions = props.startTimer === undefined ? {} : { startTimer: props.startTimer };
  const conversation = useConversationRecords(props.thread, liveOptions);

  const outbox = useOutbox(conversation.forgottenClientMessageIDs, {
    resetSequence: conversation.liveResetSequence,
  });

  const [sends, setSends] = useState(0);
  const notices = useMemoryNotices(props.thread, conversation.records);

  if (conversation.status === 'pending') {
    return <p>Loading the conversation…</p>;
  }

  if (conversation.status === 'failed') {
    return <p role="alert">The conversation did not load. Reload the page to try again.</p>;
  }

  const records = conversation.records;
  const entries = outbox.entries.filter((entry) => entry.message.thread === props.thread);

  return (
    <main className={layout}>
      <header className={header}>
        <div className={headerRow}>
          {props.navigation}
          <div className={headerControls}>
            <VoiceTypingControl />
            <ThemePicker />
          </div>
        </div>
      </header>
      {conversation.unavailable ? <LiveUpdatesNotice /> : null}
      <ConversationFailureNotice lastStepEnd={conversation.lastStepEnd} records={records} />
      <CompactionFailureNotice records={records} />
      {notices.isFailed ? <MemoryNoticesFailure onRetry={notices.retry} /> : null}
      <ConversationScroller
        arrivals={records.length + entries.length + notices.notices.length}
        sends={sends}
      >
        <ConversationList
          entries={entries}
          notices={notices.notices}
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

interface MemoryNoticesFailureProps {
  readonly onRetry: () => void;
}

function MemoryNoticesFailure(props: MemoryNoticesFailureProps): ReactNode {
  return (
    <p className={notice} role="status">
      Memory notices did not load.{' '}
      <button onClick={props.onRetry} type="button">
        Try again
      </button>
    </p>
  );
}
