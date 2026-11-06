import type { ReactNode, RefObject } from 'react';
import { Fragment } from 'react';
import { match } from 'ts-pattern';
import type { ActivityItem, TaskMessageActivity } from '../build-activity';
import { buildActivity } from '../build-activity';
import { buildNoticePlacement } from '../build-notice-placement';
import { isWorking } from '../is-working';
import { css } from '../styled-system/css';
import type { MemoryNotice as MemoryNoticeData, OutboxMessage } from '../types';
import type { LiveRecord } from '../use-live-records';
import type { OutboxEntry } from '../use-outbox';
import { ExchangeNotice } from './exchange-notice';
import { MemoryNotice } from './memory-notice';
import { MomentKeptNotice } from './moment-kept-notice';
import { OutboxItem } from './outbox-item';
import { RecordItem } from './record-item';
import { ResetMarker } from './reset-marker';
import { StepGroup } from './step-group';
import { StopMarker } from './stop-marker';
import type { TaskMessageLayout } from './task-message-entry';
import { TaskMessageEntry } from './task-message-entry';

interface LinkedMessage {
  readonly messageID: string;
  readonly ref: RefObject<HTMLLIElement | null>;
}

export interface ConversationListProps {
  readonly entries: readonly OutboxEntry[];
  readonly notices: readonly MemoryNoticeData[];
  readonly onDiscard: (clientMessageID: string) => void;
  readonly onRetry: (message: OutboxMessage) => Promise<void>;
  readonly records: readonly LiveRecord[];
  readonly taskMessageLayout: TaskMessageLayout;

  readonly linkedMessage?: LinkedMessage;
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

export function ConversationList(props: ConversationListProps): ReactNode {
  const shown = new Set(props.records.map((record) => record.message?.clientMessageId));

  const activity = buildActivity(props.records);
  const placement = buildNoticePlacement(activity, props.notices);
  const unshown = props.entries.filter((entry) => !shown.has(entry.message.clientMessageId));

  return (
    <>
      <ol aria-label="Conversation" className={css(column, messages)}>
        {activity.map((item, index) => (
          <Fragment key={item.kind === 'step' ? `step/${String(item.key)}` : item.record.sequence}>
            <ActivityEntry
              item={item}
              linkedMessage={props.linkedMessage}
              taskMessageLayout={props.taskMessageLayout}
            />
            {placement.get(index)?.map((notice) => (
              <MemoryNotice key={notice.noticeKey} notice={notice} />
            ))}
          </Fragment>
        ))}
        {unshown.map((entry) => (
          <OutboxItem
            entry={entry}
            key={entry.message.clientMessageId}
            onDiscard={props.onDiscard}
            onRetry={props.onRetry}
          />
        ))}
      </ol>
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

interface ActivityEntryProps {
  readonly item: ActivityItem;
  readonly linkedMessage: LinkedMessage | undefined;
  readonly taskMessageLayout: TaskMessageLayout;
}

function ActivityEntry(props: ActivityEntryProps): ReactNode {
  const renderMessage = (message: TaskMessageActivity): ReactNode => (
    <TaskMessageEntry
      key={message.messageID}
      layout={props.taskMessageLayout}
      message={message}
      ref={
        props.linkedMessage?.messageID === message.messageID ? props.linkedMessage.ref : undefined
      }
    />
  );

  return match(props.item)
    .with({ kind: 'message' }, (item) => <RecordItem record={item.record} />)
    .with({ kind: 'reset' }, (item) => <ResetMarker record={item.record} />)
    .with({ kind: 'moment' }, (item) => <MomentKeptNotice moment={item.moment} />)
    .with({ kind: 'taskMessage' }, (item) => renderMessage(item.message))
    .with({ kind: 'exchange' }, (item) => <ExchangeNotice notice={item.notice} />)
    .with({ kind: 'stop' }, (item) => <StopMarker stop={item.stop} />)
    .with({ kind: 'step' }, (item) => (
      <>
        <StepGroup step={item} />
        {item.sentMessages?.map(renderMessage)}
      </>
    ))
    .exhaustive();
}
