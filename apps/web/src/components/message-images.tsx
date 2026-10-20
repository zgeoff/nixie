import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../use-nixie-client';
import { ImageThumbnail } from './image-thumbnail';

export interface MessageImagesProps {
  readonly thread: string;
  readonly sequence: number;
  readonly count: number;
}

const list = css({ display: 'flex', flexWrap: 'wrap', gap: '2', marginBlock: '1' });

// The images of one of your messages in the thread, each read from the API once and kept while the
// page shows it. An image the API no longer holds, such as one of a message forgotten on another
// device, shows as a gap.
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

interface MessageImageProps {
  readonly thread: string;
  readonly sequence: number;
  readonly position: number;
}

const gap = css({ color: 'textMuted', fontSize: 'sm' });

function MessageImage(props: MessageImageProps): ReactNode {
  const nixie = useNixieClient();

  const image = useQuery({
    ...nixie.queryUtils.conversation.readImage.queryOptions({ input: props }),
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (image.data === undefined) {
    return <span className={gap}>{image.isError ? 'Image unavailable' : 'Loading image…'}</span>;
  }

  return <ImageThumbnail alt={`Image ${props.position + 1}`} image={image.data} />;
}
