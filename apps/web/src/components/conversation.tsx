import type { ReactNode } from 'react';
import { buildActivity } from '../build-activity';
import { css } from '../styled-system/css';
import { useConversationPage } from '../use-conversation-page';
import type { LiveRecord } from '../use-live-records';
import { useLiveRecords } from '../use-live-records';
import { useOutbox } from '../use-outbox';
import { Composer } from './composer';
import { OutboxItem } from './outbox-item';
import { RecordItem } from './record-item';
import { StepGroup } from './step-group';

export interface ConversationProps {
  readonly thread: string;
}

// The conversation: the page the API returned, the records the live stream adds after it, and
// the messages this device sent that the conversation does not show yet. Messages stand alone,
// and every other record folds into the step it belongs to.
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
    <main className={layout}>
      <div className={scroller}>
        <ol aria-label="Conversation" className={messages}>
          {buildActivity(records).map((item) =>
            item.kind === 'message' ? (
              <RecordItem key={item.record.sequence} record={item.record} />
            ) : (
              <StepGroup key={item.key} step={item} />
            ),
          )}
          {outbox.entries
            .filter((entry) => !shown.has(entry.message.clientMessageId))
            .map((entry) => (
              <OutboxItem
                entry={entry}
                key={entry.message.clientMessageId}
                onRetry={outbox.retry}
              />
            ))}
        </ol>
      </div>
      <div className={composerBar}>
        <Composer
          onSend={(message) => {
            outbox.add({ ...message, clientMessageId: crypto.randomUUID(), thread: props.thread });
          }}
        />
      </div>
    </main>
  );
}

// The page fills the window: the messages scroll, and the composer stays below them in view.
const layout = css({ display: 'flex', flexDirection: 'column', height: '100dvh' });

// A reversed column starts scrolled to its end and stays there as messages arrive, unless you
// scrolled up to read.
const scroller = css({
  display: 'flex',
  flex: '1',
  flexDirection: 'column-reverse',
  overflowY: 'auto',
});

const column = {
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingInline: '4',
  width: 'full',
} as const;

const messages = css(column, {
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
  paddingBlock: '4',
});

const composerBar = css({ borderTopWidth: '1px', paddingBlock: '3', '& > form': column });

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
