import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { LiveRecord } from '../use-live-records';

export interface RecordItemProps {
  readonly record: LiveRecord;
}

// One record of the conversation. A record shows its message, and a kind with no message shows
// its name.
export function RecordItem(props: RecordItemProps): ReactNode {
  if (props.record.message === undefined) {
    return (
      <li className={css({ color: 'gray.500', fontSize: 'sm' })}>
        <em>{props.record.kind}</em>
      </li>
    );
  }

  return (
    <li>
      <strong className={speaker}>{props.record.kind === 'owner_message' ? 'You' : 'nixie'}</strong>{' '}
      <span className={message}>{props.record.message.text}</span>
    </li>
  );
}

// The speaker sits on its own line above the text.
const speaker = css({ display: 'block', fontWeight: 'semibold' });

// A long reply keeps its line breaks and wraps a long word or link inside the column.
const message = css({ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' });
