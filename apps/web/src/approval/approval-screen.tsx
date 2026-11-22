import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';

// the desktop's size, which a click point is measured on
const displayWidth = 1280;
const displayHeight = 800;

export interface ApprovalScreenProps {
  readonly screen: { readonly x: number; readonly y: number; readonly picture: string };
}

const frame = css({
  borderColor: 'border',
  borderWidth: '1px',
  maxWidth: '640px',
  position: 'relative',
  width: 'full',
});

const picture = css({ display: 'block', width: 'full' });

const ring = css({
  borderColor: 'red.600',
  borderRadius: 'full',
  borderWidth: '3px',
  boxShadow: '0 0 0 2px white',
  height: '6',
  pointerEvents: 'none',
  position: 'absolute',
  transform: 'translate(-50%, -50%)',
  width: '6',
});

const gap = css({ color: 'textMuted', fontSize: 'sm' });

// The desktop as it was when the click was prepared, with a ring at the point the click lands on.
// The ring is drawn here, over the picture, so the stored picture stays as the screen showed it.
export function ApprovalScreen(props: ApprovalScreenProps): ReactNode {
  const nixie = useNixieClient();

  const image = useQuery({
    ...nixie.queryUtils.approvals.readImage.queryOptions({
      input: { imageID: props.screen.picture },
    }),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const url = useObjectURL(image.data);

  if (url === null) {
    return (
      <span className={gap}>
        {image.isError ? 'Screenshot unavailable' : 'Loading screenshot…'}
      </span>
    );
  }

  return (
    <div aria-label="Screen this click lands on" className={frame} role="group">
      <img alt="The screen when the click was prepared" className={picture} src={url} />
      <span
        aria-label={`Click point ${String(props.screen.x)}, ${String(props.screen.y)}`}
        className={ring}
        role="img"
        style={{
          left: `${String((props.screen.x / displayWidth) * 100)}%`,
          top: `${String((props.screen.y / displayHeight) * 100)}%`,
        }}
      />
    </div>
  );
}

function useObjectURL(blob: Blob | undefined): string | null {
  const [url, setURL] = useState<string | null>(null);

  useEffect(() => {
    const created = blob === undefined ? null : URL.createObjectURL(blob);

    setURL(created);

    return () => {
      if (created !== null) {
        URL.revokeObjectURL(created);
      }
    };
  }, [blob]);

  return url;
}
