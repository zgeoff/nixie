import { useEffect } from 'react';

// Keeps the screen awake while the device shows something. The browser drops a wake lock when the
// page hides, so a page that shows again asks for it again.
export function useWakeLock(isActive: boolean): void {
  useEffect(() => {
    if (!isActive || globalThis.navigator.wakeLock === undefined) {
      return () => {};
    }

    const held: { lock: WakeLockSentinel | null; isStopped: boolean } = {
      lock: null,
      isStopped: false,
    };

    const acquire = async (): Promise<void> => {
      try {
        const lock = await globalThis.navigator.wakeLock.request('screen');

        if (held.isStopped) {
          await lock.release();
        } else {
          held.lock = lock;
        }
      } catch {
        // a refused request leaves the screen to the device's own sleep setting
      }
    };

    const handleVisibility = (): void => {
      if (globalThis.document.visibilityState === 'visible' && held.lock?.released !== false) {
        void acquire();
      }
    };

    void acquire();
    globalThis.document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      held.isStopped = true;

      globalThis.document.removeEventListener('visibilitychange', handleVisibility);
      void held.lock?.release();
    };
  }, [isActive]);
}
