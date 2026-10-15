import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { OutboxMessage } from '../types';
import type { OutboxEntry } from '../use-outbox';
import { ImageThumbnail } from './image-thumbnail';

export interface OutboxItemProps {
  readonly entry: OutboxEntry;
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
