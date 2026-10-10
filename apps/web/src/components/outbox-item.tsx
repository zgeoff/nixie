import type { ReactNode } from 'react';
import type { OutboxMessage } from '../types';
import type { OutboxEntry } from '../use-outbox';

export interface OutboxItemProps {
  readonly entry: OutboxEntry;
  readonly onRetry: (message: OutboxMessage) => Promise<void>;
}

// A message this device sent that the conversation does not show yet, with how its send stands.
export function OutboxItem(props: OutboxItemProps): ReactNode {
  return (
    <li>
      <strong>You</strong> {props.entry.message.text} {renderStatus(props)}
    </li>
  );
}

function renderStatus(props: OutboxItemProps): ReactNode {
  if (props.entry.status !== 'failed') {
    return <span role="status">{props.entry.status === 'sending' ? 'Sending…' : 'Sent'}</span>;
  }

  return (
    <>
      <span role="status">Not sent</span>{' '}
      <button
        onClick={() => {
          void props.onRetry(props.entry.message);
        }}
        type="button"
      >
        Retry
      </button>
    </>
  );
}
