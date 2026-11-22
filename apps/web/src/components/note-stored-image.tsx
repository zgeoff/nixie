import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { useBlobURL } from '../utils/use-blob-url';
import { useNixieClient } from '../utils/use-nixie-client';

export interface NoteStoredImageProps {
  readonly image: string;
  readonly alt: string;
}

const picture = css({ display: 'block', maxHeight: '80dvh', maxWidth: 'full' });
const muted = css({ color: 'textMuted', fontSize: 'sm' });

// The one image a note body can load: a stored image that the images API reads by its short ID.
// An unknown or forgotten one, or one that fails to read, shows as unavailable. Nothing stays
// cached once the image leaves the screen, so a revisit after a forget reads it again.
export function NoteStoredImage(props: NoteStoredImageProps): ReactNode {
  const nixie = useNixieClient();

  const read = useQuery({
    ...nixie.queryUtils.images.readBytes.queryOptions({
      input: { image: props.image, size: 'full' },
    }),
    gcTime: 0,
    retry: false,
  });

  const url = useBlobURL(read.data);

  if (read.isError) {
    return <span className={muted}>image unavailable</span>;
  }

  if (url === null) {
    return <span className={muted}>Loading image…</span>;
  }

  return <img alt={props.alt} className={picture} src={url} />;
}
