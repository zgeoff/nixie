import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { MessageImage } from './message-image';

export interface MessageImagesProps {
  readonly thread: string;
  readonly sequence: number;
  readonly count: number;
}

const list = css({ display: 'flex', flexWrap: 'wrap', gap: '2', marginBlock: '1' });

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
