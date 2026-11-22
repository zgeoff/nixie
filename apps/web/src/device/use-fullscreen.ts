import { useEffect, useState } from 'react';

export interface Fullscreen {
  readonly isAvailable: boolean;
  readonly isFullscreen: boolean;
  readonly toggle: () => void;
}

// Full screen for the page's root element. The state follows the browser's own event, so Escape
// updates it too.
export function useFullscreen(): Fullscreen {
  const [isFullscreen, setIsFullscreen] = useState(
    () => globalThis.document.fullscreenElement !== null,
  );

  useEffect(() => {
    const handleChange = (): void => {
      setIsFullscreen(globalThis.document.fullscreenElement !== null);
    };

    globalThis.document.addEventListener('fullscreenchange', handleChange);

    return () => {
      globalThis.document.removeEventListener('fullscreenchange', handleChange);
    };
  }, []);

  return {
    isAvailable: globalThis.document.fullscreenEnabled,
    isFullscreen,
    toggle: () => {
      void switchFullscreen();
    },
  };
}

async function switchFullscreen(): Promise<void> {
  try {
    await (globalThis.document.fullscreenElement === null
      ? globalThis.document.documentElement.requestFullscreen()
      : globalThis.document.exitFullscreen());
  } catch {
    // a refused request leaves the page as it was
  }
}
