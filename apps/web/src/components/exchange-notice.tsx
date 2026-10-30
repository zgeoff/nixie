import type { ReactNode } from 'react';
import { buildTaskHref } from '../build-task-href';
import { css } from '../styled-system/css';
import type { LiveRecord } from '../use-live-records';

export interface ExchangeNoticeProps {
  readonly notice: NonNullable<LiveRecord['exchangeNotice']>;
}

const quiet = css({ color: 'textMuted', fontSize: 'sm' });
const link = css({ color: 'link', textDecoration: 'underline' });

export function ExchangeNotice(props: ExchangeNoticeProps): ReactNode {
  const notice = props.notice;
  const href = `${buildTaskHref(notice.link.taskID)}#task-message-${notice.link.messageID}`;

  return (
    <li className={quiet} role="note">
      <span>{notice.text}</span>{' '}
      <a className={link} href={href}>
        {notice.link.label}
      </a>
    </li>
  );
}
