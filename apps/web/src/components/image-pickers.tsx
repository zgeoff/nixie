import type { ReactNode } from 'react';
import { css } from '../styled-system/css';

export interface ImagePickersProps {
  readonly onPick: (files: readonly File[]) => void;
}

const pickerButton = css({
  borderColor: 'borderStrong',
  borderWidth: '1px',
  cursor: 'pointer',
  paddingBlock: '2',
  paddingInline: '3',
});

const hiddenInput = css({
  height: '1px',
  opacity: '0',
  overflow: 'hidden',
  position: 'absolute',
  width: '1px',
});

export function ImagePickers(props: ImagePickersProps): ReactNode {
  return (
    <>
      <label className={pickerButton}>
        Camera
        <input
          accept="image/*"
          capture="environment"
          className={hiddenInput}
          onChange={(event) => {
            props.onPick([...(event.target.files ?? [])]);

            event.target.value = '';
          }}
          type="file"
        />
      </label>
      <label className={pickerButton}>
        Photos
        <input
          accept="image/*,.heic,.heif"
          className={hiddenInput}
          multiple
          onChange={(event) => {
            props.onPick([...(event.target.files ?? [])]);

            event.target.value = '';
          }}
          type="file"
        />
      </label>
    </>
  );
}
