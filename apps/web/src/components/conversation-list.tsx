import type { ReactNode } from 'react';
import { buildActivity } from '../build-activity';
import { isWorking } from '../is-working';
import { css } from '../styled-system/css';
import type { OutboxMessage } from '../types';
import type { LiveRecord } from '../use-live-records';
import type { OutboxEntry } from '../use-outbox';
import { OutboxItem } from './outbox-item';
import { RecordItem } from './record-item';
import { ResetMarker } from './reset-marker';
import { StepGroup } from './step-group';

export interface ConversationListProps {
  readonly entries: readonly OutboxEntry[];
  readonly onDiscard: (clientMessageID: string) => void;
  readonly onRetry: (message: OutboxMessage) => Promise<void>;
  readonly records: readonly LiveRecord[];
}

const column = {
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingInline: '4',
  width: 'full',
} as const;

const messages = {
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
  paddingBlock: '4',
} as const;

const spinner = css({
  animation: 'spin',
  borderColor: 'border',
  borderRadius: 'full',
  borderTopColor: 'textMuted',
  borderWidth: '2px',
  display: 'block',
  height: '4',
  width: '4',
  _motionReduce: { animation: 'none' },
});

// The conversation's records in order, then the messages this device sent that the records do
// not show yet, then a quiet spinner while nixie works.
export function ConversationList(props: ConversationListProps): ReactNode {
  const shown = new Set(props.records.map((record) => record.message?.clientMessageId));

  const activity = buildActivity(props.records);
  const unshown = props.entries.filter((entry) => !shown.has(entry.message.clientMessageId));

  return (
    <>
      <ol aria-label="Conversation" className={css(column, messages)}>
        {activity.map((item) => {
          if (item.kind === 'message') {
            return <RecordItem key={item.record.sequence} record={item.record} />;
          }

          if (item.kind === 'reset') {
            return <ResetMarker key={item.record.sequence} record={item.record} />;
          }

          return <StepGroup key={item.key} step={item} />;
        })}
        {unshown.map((entry) => (
          <OutboxItem
            entry={entry}
            key={entry.message.clientMessageId}
            onDiscard={props.onDiscard}
            onRetry={props.onRetry}
          />
        ))}
      </ol>
      {/* the spinner's slot keeps its height when the spinner goes, so the messages never jump */}
      <div className={css(column, { height: '6' })}>
        {isWorking(
          activity,
          unshown.some((entry) => entry.status === 'sending' || entry.status === 'sent'),
        ) ? (
          <span aria-label="nixie is working" className={spinner} role="progressbar" />
        ) : null}
      </div>
    </>
  );
}
