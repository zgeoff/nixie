import { useEffect, useState } from 'react';
import { startPlatformTimer } from '../utils/start-platform-timer';

const tickMs = 1000;

// The time now in milliseconds, read again each second, so a live value in the page stays fresh
// with no event from the server.
export function useNow(): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer: { stop: () => void } = { stop: () => {} };

    const tick = (): void => {
      setNowMs(Date.now());

      timer.stop = startPlatformTimer(tick, tickMs);
    };

    timer.stop = startPlatformTimer(tick, tickMs);

    return () => {
      timer.stop();
    };
  }, []);

  return nowMs;
}
