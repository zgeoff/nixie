import { useSyncExternalStore } from 'react';

// The server knows neither the browser's locale nor its time zone, so a time that the server render
// and hydration leave out waits for this to turn true in the browser.
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

function subscribeToNothing(): () => void {
  return () => {};
}
