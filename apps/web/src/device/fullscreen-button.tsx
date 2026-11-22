import type { ReactNode } from 'react';
import { useFullscreen } from './use-fullscreen';

export function FullscreenButton(): ReactNode {
  const fullscreen = useFullscreen();

  if (!fullscreen.isAvailable) {
    return null;
  }

  return (
    <button name="fullscreen" onClick={fullscreen.toggle} type="button">
      {fullscreen.isFullscreen ? 'Leave full screen' : 'Full screen'}
    </button>
  );
}
