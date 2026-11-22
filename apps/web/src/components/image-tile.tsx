import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { css } from '../styled-system/css';
import type { GalleryImage } from '../types';
import { isImageForgottenError } from '../utils/is-image-forgotten-error';
import { useBlobURL } from '../utils/use-blob-url';
import { useIsSeen } from '../utils/use-is-seen';
import { useNixieClient } from '../utils/use-nixie-client';

export interface ImageTileProps {
  readonly image: GalleryImage;
  readonly onForgotten: (image: string) => void;
  readonly onOpen: (image: string) => void;
}

const tile = css({
  borderColor: 'border',
  borderWidth: '1px',
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  padding: '2',
});

const opener = css({
  alignItems: 'center',
  backgroundColor: 'canvas',
  cursor: 'zoom-in',
  display: 'flex',
  height: '40',
  justifyContent: 'center',
  overflow: 'hidden',
});

const picture = css({ maxHeight: 'full', maxWidth: 'full', objectFit: 'contain' });
const muted = css({ color: 'textMuted', fontSize: 'sm' });
const name = css({ fontWeight: 'semibold', overflowWrap: 'anywhere' });

// One stored image: the thumbnail reads once the tile scrolls into view. The bytes stay a blob in
// the page, and the page never navigates to them. A thumbnail that answers IMAGE_FORGOTTEN takes
// its tile off the grid.
export function ImageTile(props: ImageTileProps): ReactNode {
  const image = props.image;
  const nixie = useNixieClient();
  const ref = useRef<HTMLLIElement>(null);
  const isSeen = useIsSeen(ref);
  const onForgotten = props.onForgotten;

  const read = useQuery({
    ...nixie.queryUtils.images.readBytes.queryOptions({
      input: { image: image.image, size: 'thumbnail' },
    }),
    enabled: isSeen,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const url = useBlobURL(read.data);
  const isForgotten = isImageForgottenError(read.error);

  useEffect(() => {
    if (isForgotten) {
      onForgotten(image.image);
    }
  }, [image.image, isForgotten, onForgotten]);

  const label = image.name ?? image.image;

  return (
    <li className={tile} ref={ref}>
      <button
        aria-label={`Open ${label}`}
        className={opener}
        onClick={() => {
          props.onOpen(image.image);
        }}
        type="button"
      >
        {read.isError ? <span className={muted}>Unavailable</span> : null}
        {!read.isError && url === null ? <span className={muted}>Loading…</span> : null}
        {!read.isError && url !== null ? <img alt={label} className={picture} src={url} /> : null}
      </button>
      {image.name === null ? null : <span className={name}>{image.name}</span>}
      <span className={muted}>{formatImageSummary(image)}</span>
    </li>
  );
}

function formatImageSummary(image: GalleryImage): string {
  const parts = [
    image.isPinned ? 'Pinned' : null,
    image.from === null ? null : 'Edit',
    image.source === 'file' ? 'Imported file' : null,
    image.source === 'photo' ? 'Imported photo' : null,
  ];

  return parts.filter((part) => part !== null).join(' · ');
}
