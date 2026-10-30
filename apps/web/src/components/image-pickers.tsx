import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import { useIsHydrated } from '../use-is-hydrated';

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

// The server render shows the pickers before React listens for a change, and a pick made then is
// lost, so each picker waits for hydration.
export function ImagePickers(props: ImagePickersProps): ReactNode {
  const isHydrated = useIsHydrated();

  return (
    <>
      <label className={pickerButton}>
        Camera
        <input
          accept="image/*"
          capture="environment"
          className={hiddenInput}
          disabled={!isHydrated}
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
          disabled={!isHydrated}
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
