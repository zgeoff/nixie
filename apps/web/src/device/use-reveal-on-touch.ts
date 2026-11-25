import { useEffect, useState } from 'react';
import { startPlatformTimer } from '../utils/start-platform-timer';

const revealMs = 4000;

// Whether the screen's buttons show: false until a touch or a pointer move, then true
// for `revealMs` after the latest one.
export function useRevealOnTouch(): boolean {
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    const timer: { stop: () => void } = { stop: () => {} };

    const reveal = (): void => {
      timer.stop();

      setIsRevealed(true);

      timer.stop = startPlatformTimer(() => {
        setIsRevealed(false);
      }, revealMs);
    };

    globalThis.addEventListener('pointerdown', reveal);
    globalThis.addEventListener('pointermove', reveal);

    return () => {
      timer.stop();
      globalThis.removeEventListener('pointerdown', reveal);
      globalThis.removeEventListener('pointermove', reveal);
    };
  }, []);

  return isRevealed;
}
