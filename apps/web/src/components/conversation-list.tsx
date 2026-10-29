import type { ReactNode } from 'react';
import { Fragment } from 'react';
import type { ActivityItem } from '../build-activity';
import { buildActivity } from '../build-activity';
import { buildNoticePlacement } from '../build-notice-placement';
import type { MessageRoute } from '../collect-message-routes';
import { collectMessageRoutes } from '../collect-message-routes';
import { isWorking } from '../is-working';
import { css } from '../styled-system/css';
import type { MemoryNotice as MemoryNoticeData, OutboxMessage } from '../types';
import type { LiveRecord } from '../use-live-records';
import type { OutboxEntry } from '../use-outbox';
import type { RoutedTasks } from '../use-routed-tasks';
import { useRoutedTasks } from '../use-routed-tasks';
import { MemoryNotice } from './memory-notice';
import { MomentKeptNotice } from './moment-kept-notice';
import { OutboxItem } from './outbox-item';
import { RecordItem } from './record-item';
import { ResetMarker } from './reset-marker';
import { StepGroup } from './step-group';

export interface ConversationListProps {
  readonly entries: readonly OutboxEntry[];
  readonly notices: readonly MemoryNoticeData[];
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

export function ConversationList(props: ConversationListProps): ReactNode {
  const shown = new Set(props.records.map((record) => record.message?.clientMessageId));

  const activity = buildActivity(props.records);
  const placement = buildNoticePlacement(activity, props.notices);
  const unshown = props.entries.filter((entry) => !shown.has(entry.message.clientMessageId));
  const routes = collectMessageRoutes(props.records);
  const taskList = useRoutedTasks(routes);

  return (
    <>
      <ol aria-label="Conversation" className={css(column, messages)}>
        {activity.map((item, index) => (
          <Fragment key={item.kind === 'step' ? `step/${String(item.key)}` : item.record.sequence}>
            <ActivityEntry item={item} routes={routes} taskList={taskList} />
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
  readonly routes: ReadonlyMap<number, MessageRoute>;
  readonly taskList: RoutedTasks;
}

function ActivityEntry(props: ActivityEntryProps): ReactNode {
  const item = props.item;

  if (item.kind === 'message') {
    return (
      <RecordItem
        record={item.record}
        route={props.routes.get(item.record.sequence)}
        taskList={props.taskList}
      />
    );
  }

  if (item.kind === 'reset') {
    return <ResetMarker record={item.record} />;
  }

  if (item.kind === 'moment') {
    return <MomentKeptNotice moment={item.moment} />;
  }

  return <StepGroup step={item} />;
}
