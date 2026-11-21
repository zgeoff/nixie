import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { useBlobURL } from '../utils/use-blob-url';
import { useNixieClient } from '../utils/use-nixie-client';

export interface DeviceImageProps {
  readonly image: string;
  readonly fit: 'whole' | 'fill';
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

  if (url === null) {
    return null;
  }

  return (
    <img alt="" className={props.fit === 'fill' ? fill : whole} data-fit={props.fit} src={url} />
  );
}
