import type { RefObject } from 'react';
import { useEffect } from 'react';
import { readElementPixels } from './read-element-pixels';
import { useDeviceFeed } from './use-device-feed';

// Reports the size of the element to the device while it shows, which the server keeps as the size
// of the device.
export function useViewPixels(area: RefObject<HTMLElement | null>): void {
  const feed = useDeviceFeed();

  useEffect(() => {
    const element = area.current;

    if (element === null) {
      return () => {};
    }

    feed.setViewPixels(readElementPixels(element));

    const observer = new ResizeObserver(() => {
      feed.setViewPixels(readElementPixels(element));
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
      feed.setViewPixels(null);
    };
  }, [area, feed]);
}
