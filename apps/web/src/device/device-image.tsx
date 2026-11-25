import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { css } from '../styled-system/css';
import { useBlobURL } from '../utils/use-blob-url';
import { useNixieClient } from '../utils/use-nixie-client';

export interface DeviceImageProps {
  readonly image: string;
  readonly fit: 'whole' | 'fill';

  // called once for each image and reason when the picture cannot be read or drawn
  readonly onFail?: (message: string) => void;
}

const whole = css({ height: '100%', objectFit: 'contain', width: '100%' });

// 'fill' scales the picture to cover the screen, centres it and crops the overflow evenly.
const fill = css({
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'center',
  width: '100%',
});

export function DeviceImage(props: DeviceImageProps): ReactNode {
  const nixie = useNixieClient();

  const bytes = useQuery({
    ...nixie.queryUtils.devices.readImage.queryOptions({ input: { image: props.image } }),
    staleTime: 'static',
  });

  const url = useBlobURL(bytes.data);
  const failure = bytes.error?.message;
  const onFail = props.onFail;
  const image = props.image;
  const reported = useRef<string | null>(null);

  // The key holds the image with the reason, so a replacement image that fails with the same
  // reason reports again, and one reason reports once.
  const reportOnce = useCallback(
    (message: string) => {
      const key = `${image}\n${message}`;

      if (reported.current !== key) {
        reported.current = key;
        onFail?.(message);
      }
    },
    [image, onFail],
  );

  useEffect(() => {
    if (failure !== undefined) {
      reportOnce(failure);
    }
  }, [failure, reportOnce]);

  if (url === null) {
    return null;
  }

  return (
    <img
      alt="Picture"
      className={props.fit === 'fill' ? fill : whole}
      data-fit={props.fit}
      onError={() => {
        reportOnce('the picture could not be decoded');
      }}
      src={url}
    />
  );
}
