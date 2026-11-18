import type { RefObject } from 'react';
import { useEffect, useState } from 'react';

// Whether the element has scrolled into view at least once. A browser with no
// IntersectionObserver counts every element as seen.
export function useIsSeen(ref: RefObject<Element | null>): boolean {
  const [isSeen, setIsSeen] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;

    if (isSeen || element === null) {
      return () => {};
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setIsSeen(true);
      }
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [isSeen, ref]);

  return isSeen;
}
