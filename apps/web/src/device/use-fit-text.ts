import type { RefObject } from 'react';
import { useEffect, useLayoutEffect } from 'react';

// Sets the font size of `content` to the largest one at which it fits `container`, now and each
// time the container's size or `dependency` changes. The content is as wide as the container and
// as tall as its text, so wrapped text and a line that does not wrap both fit by the same test.
export function useFitText(
  container: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
  dependency: string,
): void {
  useLayoutEffect(() => {
    fitText(container.current, content.current);
  }, [container, content, dependency]);

  useEffect(() => {
    const element = container.current;

    if (element === null || typeof ResizeObserver === 'undefined') {
      return () => {};
    }

    const observer = new ResizeObserver(() => {
      fitText(container.current, content.current);
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [container, content]);
}

const minFontPx = 1;
const searchSteps = 12;

function fitText(container: HTMLElement | null, content: HTMLElement | null): void {
  if (container === null || content === null) {
    return;
  }

  const widthPx = container.clientWidth;
  const heightPx = container.clientHeight;

  if (widthPx === 0 || heightPx === 0) {
    return;
  }

  const search = { low: minFontPx, high: Math.max(minFontPx, heightPx) };

  for (let step = 0; step < searchSteps; step += 1) {
    const middle = (search.low + search.high) / 2;

    content.style.fontSize = `${String(middle)}px`;

    const isFit = content.scrollWidth <= widthPx && content.scrollHeight <= heightPx;

    if (isFit) {
      search.low = middle;
    } else {
      search.high = middle;
    }
  }

  content.style.fontSize = `${String(search.low)}px`;
}
