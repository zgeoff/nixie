import { useCallback, useEffect, useRef, useState } from 'react';
import { startPlatformTimer } from '../utils/start-platform-timer';

const revealMs = 4000;

export interface RevealOnTouch {
  readonly isRevealed: boolean;

  // shows the buttons, for a touch that happened where this page's own listeners can't see it
  readonly reveal: () => void;
}

// Whether the screen's buttons show: false until a touch or a pointer move, then true
// for `revealMs` after the latest one.
export function useRevealOnTouch(): RevealOnTouch {
  const [isRevealed, setIsRevealed] = useState(false);
  const timer = useRef<{ stop: () => void }>({ stop: () => {} });

  const reveal = useCallback((): void => {
    timer.current.stop();

    setIsRevealed(true);

    timer.current.stop = startPlatformTimer(() => {
      setIsRevealed(false);
    }, revealMs);
  }, []);

  useEffect(() => {
    const current = timer.current;

    globalThis.addEventListener('pointerdown', reveal);
    globalThis.addEventListener('pointermove', reveal);

    return () => {
      current.stop();
      globalThis.removeEventListener('pointerdown', reveal);
      globalThis.removeEventListener('pointermove', reveal);
    };
  }, [reveal]);

  return { isRevealed, reveal };
}
