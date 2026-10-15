import type { ReactNode } from 'react';
import { findCompactionFailure } from '../find-compaction-failure';
import { css } from '../styled-system/css';
import type { LiveRecord } from '../use-live-records';

export interface CompactionFailureNoticeProps {
  readonly records: readonly LiveRecord[];
}

// Sits above the messages from the first compaction that fails, and goes once a summary commits.
// The conversation goes on in the same session, which stops answering once it fills its window.
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

const notice = css({
  color: 'textMuted',
  fontSize: 'sm',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '2',
  paddingInline: '4',
  width: 'full',
});
