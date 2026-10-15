import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { css } from '../styled-system/css';

export interface ImageThumbnailProps {
  readonly alt: string;
  readonly image: Blob;
}

// A small view of an image the page holds, through an object URL that it releases once the image
// leaves the page, so a removed or sent image does not stay in the browser's memory.
export function ImageThumbnail(props: ImageThumbnailProps): ReactNode {
  const [url, setURL] = useState<string | null>(null);

  useEffect(() => {
    const created = URL.createObjectURL(props.image);

    setURL(created);

    return () => {
      URL.revokeObjectURL(created);
    };
  }, [props.image]);

  return url === null ? null : <img alt={props.alt} className={thumbnail} src={url} />;
}

const thumbnail = css({
  borderColor: 'border',
  borderWidth: '1px',
  height: '16',
  objectFit: 'cover',
  width: '16',
});
