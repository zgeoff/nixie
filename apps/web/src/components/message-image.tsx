import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../use-nixie-client';
import { ImageThumbnail } from './image-thumbnail';

export interface MessageImageProps {
  readonly thread: string;
  readonly sequence: number;

  readonly position: number;
}

const gap = css({ color: 'textMuted', fontSize: 'sm' });

export function MessageImage(props: MessageImageProps): ReactNode {
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
