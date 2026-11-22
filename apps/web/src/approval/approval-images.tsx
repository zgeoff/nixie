import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ImageThumbnail } from '../components/image-thumbnail';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';

export interface ApprovalImagesProps {
  readonly imageIDs: readonly string[];
}

const row = css({ display: 'flex', flexWrap: 'wrap', gap: '2' });

// The stored pictures that the action would send, so the owner sees each one before approving.
export function ApprovalImages(props: ApprovalImagesProps): ReactNode {
  return (
    <div aria-label="Photos this would send" className={row} role="group">
      {props.imageIDs.map((imageID, index) => (
        <ApprovalImage imageID={imageID} key={imageID} number={index + 1} />
      ))}
    </div>
  );
}

interface ApprovalImageProps {
  readonly imageID: string;
  readonly number: number;
}

const gap = css({ color: 'textMuted', fontSize: 'sm' });

function ApprovalImage(props: ApprovalImageProps): ReactNode {
  const nixie = useNixieClient();

  const image = useQuery({
    ...nixie.queryUtils.approvals.readImage.queryOptions({ input: { imageID: props.imageID } }),
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (image.data === undefined) {
    return <span className={gap}>{image.isError ? 'Photo unavailable' : 'Loading photo…'}</span>;
  }

  return <ImageThumbnail alt={`Photo ${props.number}`} image={image.data} />;
}
