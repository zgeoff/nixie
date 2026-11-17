import type { ReactNode } from 'react';
import type { LiveRecord } from '../conversation/use-live-records';
import { css } from '../styled-system/css';
import { formatLateness } from './format-lateness';

export interface ReminderNoticeProps {
  readonly reminder: NonNullable<LiveRecord['reminder']>;
}

const quiet = css({ color: 'textMuted', fontSize: 'sm' });

const timeFormat: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
  weekday: 'short',
};

export function ReminderNotice(props: ReminderNoticeProps): ReactNode {
  const reminder = props.reminder;

  const time = new Date(reminder.scheduledFor).toLocaleString(undefined, timeFormat);

  return (
    <li className={quiet} role="note">
      <span>Reminder: {reminder.note}</span>{' '}
      {reminder.name === null ? null : <span>({reminder.name})</span>}{' '}
      <span>
        Set for {time}
        {reminder.lateBySeconds === null ? '' : ` (${formatLateness(reminder.lateBySeconds)} late)`}
      </span>
    </li>
  );
}
