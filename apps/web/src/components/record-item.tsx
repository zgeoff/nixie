import type { ReactNode } from 'react';
import type { LiveRecord } from '../use-live-records';

export interface RecordItemProps {
  readonly record: LiveRecord;
}

// One record of the conversation. A record shows its message, and a kind with no message shows
// its name.
export function RecordItem(props: RecordItemProps): ReactNode {
  if (props.record.message === undefined) {
    return (
      <li>
        <em>{props.record.kind}</em>
      </li>
    );
  }

  return (
    <li>
      <strong>{props.record.kind === 'owner_message' ? 'You' : 'nixie'}</strong>{' '}
      {props.record.message.text}
    </li>
  );
}
