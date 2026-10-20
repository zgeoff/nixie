import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { MessageImage } from './message-image';

export interface MessageImagesProps {
  readonly thread: string;
  readonly sequence: number;
  readonly count: number;
}

// The images of one of your messages in the thread, each read from the API on its own. An image the
// API no longer holds, such as one of a message forgotten on another device, shows as a gap.
export function MessageImages(props: MessageImagesProps): ReactNode {
  return (
    <ul aria-label="Images" className={list}>
      {Array.from({ length: props.count }, (_, position) => (
        <li key={position}>
          <MessageImage position={position} sequence={props.sequence} thread={props.thread} />
        </li>
      ))}
    </ul>
  );
}

const list = css({ display: 'flex', flexWrap: 'wrap', gap: '2', marginBlock: '1' });
