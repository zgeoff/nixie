import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { formatOutboxAge } from '../format-outbox-age';
import { css } from '../styled-system/css';
import type { OutboxMessage } from '../types';
import type { OutboxEntry } from '../use-outbox';
import { ImageThumbnail } from './image-thumbnail';

export interface OutboxItemProps {
  readonly entry: OutboxEntry;
  readonly onDiscard: (clientMessageID: string) => void;
  readonly onRetry: (message: OutboxMessage) => Promise<void>;
}

// A message this device sent that the conversation does not show yet, with its images and how its
// send stands.
export function OutboxItem(props: OutboxItemProps): ReactNode {
  return (
    <li>
      <strong className={css({ display: 'block', fontWeight: 'semibold' })}>You</strong>{' '}
      <span className={css({ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' })}>
        {props.entry.message.text}
      </span>{' '}
      {renderImages(props.entry.message.images ?? [])}
      {renderStatus(props)}
    </li>
  );
}

function renderImages(images: readonly File[]): ReactNode {
  if (images.length === 0) {
    return null;
  }

  return (
    <ul aria-label="Images" className={css({ display: 'flex', flexWrap: 'wrap', gap: '2' })}>
      {images.map((image, index) => (
        <li key={index}>
          <ImageThumbnail alt={`Image ${index + 1}`} image={image} />
        </li>
      ))}
    </ul>
  );
}

function renderStatus(props: OutboxItemProps): ReactNode {
  const entry = props.entry;

  if (entry.status === 'sending') {
    return <span role="status">{(entry.failures ?? 0) > 0 ? 'Retrying…' : 'Sending…'}</span>;
  }

  if (entry.status === 'sent') {
    return <span role="status">Sent</span>;
  }

  if (entry.status === 'held') {
    return <HeldStatus {...props} />;
  }

  return (
    <>
      {entry.retryAt === undefined ? (
        <span role="status">Not sent</span>
      ) : (
        <RetryCountdown retryAt={entry.retryAt} />
      )}{' '}
      <button
        onClick={() => {
          void props.onRetry(entry.message);
        }}
        type="button"
      >
        Retry
      </button>
    </>
  );
}

// A message that waited too long to go on its own, with how long ago you wrote it, until you send
// or discard it.
function HeldStatus(props: OutboxItemProps): ReactNode {
  const message = props.entry.message;

  return (
    <>
      <span role="status">Not sent · {formatOutboxAge(message.writtenAt, Date.now())}</span>{' '}
      <button
        onClick={() => {
          void props.onRetry(message);
        }}
        type="button"
      >
        Send
      </button>{' '}
      <button
        onClick={() => {
          props.onDiscard(message.clientMessageId);
        }}
        type="button"
      >
        Discard
      </button>
    </>
  );
}

interface RetryCountdownProps {
  readonly retryAt: number;
}

// Counts down each second to the next try a failed send makes on its own.
function RetryCountdown(props: RetryCountdownProps): ReactNode {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const ticks = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(ticks);
    };
  }, []);

  const seconds = Math.max(Math.ceil((props.retryAt - now) / 1000), 1);

  return <span role="status">Not sent · next try in {seconds} s</span>;
}
