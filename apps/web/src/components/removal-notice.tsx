import type { ReactNode } from 'react';
import type { RemovalRecord } from '../notice/build-removal-placement';
import { formatRemovalNotice } from '../notice/format-removal-notice';
import { css } from '../styled-system/css';

export interface RemovalNoticeProps {
  readonly record: RemovalRecord;
}

const quiet = css({ color: 'textMuted', fontSize: 'sm' });

export function RemovalNotice(props: RemovalNoticeProps): ReactNode {
  return (
    <li className={quiet} role="note">
      {formatRemovalNotice(props.record.removal)}
    </li>
  );
}
