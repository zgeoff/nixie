import type { ReactNode } from 'react';
import { findCompactionFailure } from '../conversation/find-compaction-failure';
import type { LiveRecord } from '../conversation/use-live-records';
import { css } from '../styled-system/css';

export interface CompactionFailureNoticeProps {
  readonly records: readonly LiveRecord[];
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

export function CompactionFailureNotice(props: CompactionFailureNoticeProps): ReactNode {
  const failures = findCompactionFailure(props.records);

  if (failures === null) {
    return null;
  }

  const times = failures === 1 ? 'once' : `${failures} times in a row`;

  return (
    <p className={notice} role="alert">
      nixie failed to summarize the conversation {times}. It tries again before your next message,
      and the conversation stops when its context is full.
    </p>
  );
}
