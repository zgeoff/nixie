import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { css } from '../styled-system/css';

export interface ImageViewerProps {
  readonly alt: string;
  readonly onClose: () => void;

  // a blob URL
  readonly source: string;
}

const dialog = css({
  backgroundColor: 'transparent',
  borderWidth: '0',
  maxHeight: '100dvh',
  maxWidth: '100vw',
  padding: '4',
  '&::backdrop': { backgroundColor: 'rgb(0 0 0 / 0.8)' },
});

const image = css({ display: 'block', maxHeight: '90dvh', maxWidth: '90vw' });
const closeButton = css({ display: 'block', marginBlockEnd: '2', marginInlineStart: 'auto' });

// The full-size image of a file, in a dialog that Escape, the close button or a tap outside the
// image closes.
export function ImageViewer(props: ImageViewerProps): ReactNode {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = ref.current;

    if (element !== null && !element.open) {
      element.showModal();
    }
  }, []);

  return (
    <dialog
      aria-label={props.alt}
      className={dialog}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
      onClose={props.onClose}
      ref={ref}
    >
      <button className={closeButton} onClick={props.onClose} type="button">
        Close
      </button>
      <img alt={props.alt} className={image} src={props.source} />
    </dialog>
  );
}
