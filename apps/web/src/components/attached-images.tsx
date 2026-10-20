import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { AttachedImage } from '../use-attached-images';
import { ImageThumbnail } from './image-thumbnail';

export interface AttachedImagesProps {
  readonly images: readonly AttachedImage[];
  readonly onRemove: (id: string) => void;
}

const list = css({ display: 'flex', flexWrap: 'wrap', gap: '2' });
const item = css({ position: 'relative' });

const removeButton = css({
  backgroundColor: 'surface',
  borderColor: 'borderStrong',
  borderWidth: '1px',
  insetInlineEnd: '0',
  lineHeight: '1',
  paddingInline: '1',
  position: 'absolute',
  top: '0',
});

// The images attached to the message you are writing, each with the control that takes it off.
export function AttachedImages(props: AttachedImagesProps): ReactNode {
  if (props.images.length === 0) {
    return null;
  }

  return (
    <ul aria-label="Attached images" className={list}>
      {props.images.map((image, index) => (
        <li className={item} key={image.id}>
          <ImageThumbnail alt={`Attached image ${index + 1}`} image={image.file} />
          <button
            aria-label={`Remove image ${index + 1}`}
            className={removeButton}
            onClick={() => {
              props.onRemove(image.id);
            }}
            type="button"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
