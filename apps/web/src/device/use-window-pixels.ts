import { useEffect } from 'react';
import { readScreenPixels } from './read-screen-pixels';
import { useDeviceFeed } from './use-device-feed';

// Reports the size of this window to the device while the page shows, which the server keeps as
// the size of the device.
export function useWindowPixels(): void {
  const feed = useDeviceFeed();

  useEffect(() => {
    const reportSize = (): void => {
      feed.setViewPixels(readScreenPixels());
    };

    reportSize();

    globalThis.addEventListener('resize', reportSize);

    return () => {
      globalThis.removeEventListener('resize', reportSize);
      feed.setViewPixels(null);
    };
  }, [feed]);
}
