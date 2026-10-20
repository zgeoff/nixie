// Calls onTimeout once delayMs pass, unless the returned stop runs first.
export type StartTimer = (onTimeout: () => void, delayMs: number) => () => void;

// The platform's setTimeout in the shape a test can replace with a stub timer.
export function startPlatformTimer(onTimeout: () => void, delayMs: number): () => void {
  const timer = setTimeout(onTimeout, delayMs);

  return () => {
    clearTimeout(timer);
  };
}
