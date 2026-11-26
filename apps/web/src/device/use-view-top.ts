import type { RefObject } from 'react';
import { useEffect } from 'react';

const viewTopProperty = '--device-view-top';

// Keeps the element's top, in pixels from the top of the page, in the custom property that its
// height subtracts from the window's, so the element fills the window below everything above it: the
// app bar, the call bar and the banners.
export function useViewTop(area: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = area.current;

    if (element === null) {
      return () => {};
    }

    const writeTop = (): void => {
      const top = element.getBoundingClientRect().top + globalThis.scrollY;

      element.style.setProperty(viewTopProperty, `${top}px`);
    };

    writeTop();

    const observer = new ResizeObserver(writeTop);

    observer.observe(globalThis.document.body);
    globalThis.addEventListener('resize', writeTop);

    return () => {
      observer.disconnect();
      globalThis.removeEventListener('resize', writeTop);
    };
  }, [area]);
}
