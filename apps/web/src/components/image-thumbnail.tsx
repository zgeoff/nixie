import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { css } from '../styled-system/css';

export interface ImageThumbnailProps {
  readonly alt: string;
  readonly image: Blob;
}

const thumbnail = css({
  borderColor: 'border',
  borderWidth: '1px',
  height: '16',
  objectFit: 'cover',
  width: '16',
});

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
