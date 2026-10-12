import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { LiveRecord } from '../use-live-records';

export interface RecordItemProps {
  readonly record: LiveRecord;
}

// One message of the conversation: yours, or a reply. A message the log forgot keeps its place
// with no text.
export function RecordItem(props: RecordItemProps): ReactNode {
  return (
    <li>
      <strong className={speaker}>{props.record.kind === 'owner_message' ? 'You' : 'nixie'}</strong>{' '}
      <span className={message}>{props.record.message?.text ?? ''}</span>
    </li>
  );
}

// The speaker sits on its own line above the text.
const speaker = css({ display: 'block', fontWeight: 'semibold' });

// A long reply keeps its line breaks and wraps a long word or link inside the column.
const message = css({ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' });
