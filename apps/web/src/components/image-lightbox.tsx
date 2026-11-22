import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { css } from '../styled-system/css';
import type { ForgetBackup, GalleryImage } from '../types';
import { isImageForgottenError } from '../utils/is-image-forgotten-error';
import { useBlobURL } from '../utils/use-blob-url';
import { useNixieClient } from '../utils/use-nixie-client';
import { ForgetBackupLine } from './forget-backup-line';
import { ImageForgetControl } from './image-forget-control';

export interface ImageLightboxProps {
  readonly image: string;
  readonly onClose: () => void;
  readonly onForgotten: (image: string) => void;
}

const dialog = css({
  backgroundColor: 'canvas',
  borderColor: 'borderStrong',
  borderWidth: '1px',
  color: 'text',
  margin: 'auto',
  maxHeight: '100dvh',
  maxWidth: '100vw',
  padding: '4',
  width: '5xl',
  _backdrop: { backgroundColor: 'scrim' },
});

const layout = css({
  display: 'flex',
  flexDirection: { base: 'column', md: 'row' },
  gap: '4',
});

const stage = css({
  alignItems: 'center',
  display: 'flex',
  flex: '1',
  justifyContent: 'center',
  minWidth: '0',
});

const details = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
  maxWidth: { md: '20rem' },
  minWidth: '0',
});

interface ForgottenImage {
  readonly image: string;
  readonly backup: ForgetBackup;
}

const closeButton = css({ display: 'block', marginBlockEnd: '2', marginInlineStart: 'auto' });

// The full image beside its name, its prompt and where it came from. It reads the image by its ID,
// so a forgotten image shows as forgotten and keeps its link to the image it was edited from.
export function ImageLightbox(props: ImageLightboxProps): ReactNode {
  const nixie = useNixieClient();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = ref.current;

    if (element !== null && !element.open) {
      element.showModal();
    }
  }, []);

  const [forget, setForget] = useState<ForgottenImage | null>(null);

  const read = useQuery({
    ...nixie.queryUtils.images.read.queryOptions({ input: { image: props.image } }),
    retry: false,
  });

  const backup = forget?.image === props.image ? forget.backup : null;
  const title = read.data?.name ?? props.image;

  return (
    <dialog aria-label={title} className={dialog} onClose={props.onClose} ref={ref}>
      <button className={closeButton} onClick={props.onClose} type="button">
        Close
      </button>
      <div className={layout}>
        <div className={stage}>
          <FullImage image={props.image} isForgotten={read.data?.isForgotten ?? false} />
        </div>
        <div className={details}>
          {read.isError ? <p role="alert">This image could not be read.</p> : null}
          {read.isSuccess ? (
            <ImageDetails
              backup={backup}
              image={read.data}
              onForgotten={(image, forgetBackup) => {
                setForget({ image, backup: forgetBackup });

                props.onForgotten(image);
              }}
            />
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

const picture = css({ display: 'block', maxHeight: '80dvh', maxWidth: 'full' });
const muted = css({ color: 'textMuted', fontSize: 'sm' });

interface FullImageProps {
  readonly image: string;
  readonly isForgotten: boolean;
}

function FullImage(props: FullImageProps): ReactNode {
  const nixie = useNixieClient();

  const read = useQuery({
    ...nixie.queryUtils.images.readBytes.queryOptions({
      input: { image: props.image, size: 'full' },
    }),
    enabled: !props.isForgotten,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const url = useBlobURL(read.data);

  if (props.isForgotten || isImageForgottenError(read.error)) {
    return <p>Forgotten</p>;
  }

  if (read.isError) {
    return <p className={muted}>Unavailable</p>;
  }

  if (url === null) {
    return <p className={muted}>Loading…</p>;
  }

  return <img alt={props.image} className={picture} src={url} />;
}

const prompt = css({ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' });

interface ImageDetailsProps {
  readonly backup: ForgetBackup | null;
  readonly image: GalleryImage;
  readonly onForgotten: (image: string, backup: ForgetBackup) => void;
}

function ImageDetails(props: ImageDetailsProps): ReactNode {
  const image = props.image;

  return (
    <>
      {image.name === null ? null : <h2>{image.name}</h2>}
      {image.prompt === null ? null : <p className={prompt}>{image.prompt}</p>}
      {image.isForgotten ? null : (
        <time className={muted} dateTime={image.createdAt.toISOString()}>
          Made {image.createdAt.toLocaleString()}
        </time>
      )}
      <ImageSource image={image} />
      {props.backup === null ? null : <ForgetBackupLine backup={props.backup} />}
      {image.isForgotten || props.backup !== null ? null : (
        <ImageForgetControl image={image.image} key={image.image} onForgotten={props.onForgotten} />
      )}
    </>
  );
}

const link = css({ color: 'link', textDecoration: 'underline' });

interface ImageSourceProps {
  readonly image: GalleryImage;
}

function ImageSource(props: ImageSourceProps): ReactNode {
  const nixie = useNixieClient();
  const from = props.image.from;

  const earlier = useQuery({
    ...nixie.queryUtils.images.read.queryOptions({ input: { image: from ?? '' } }),
    enabled: from !== null,
    retry: false,
  });

  if (from !== null) {
    return (
      <p className={muted}>
        Edited from{' '}
        <Link className={link} search={(previous) => ({ ...previous, image: from })} to="/images">
          {earlier.data?.name ?? from}
        </Link>
      </p>
    );
  }

  if (props.image.source === 'file') {
    return <p className={muted}>Imported from a file</p>;
  }

  return props.image.source === 'photo' ? <p className={muted}>Imported from a photo</p> : null;
}
