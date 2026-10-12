// Calls onTimeout once ms pass, unless the returned stop runs first.
export type StartTimer = (onTimeout: () => void, ms: number) => () => void;

// The platform's setTimeout in the shape a test can replace with a stub timer.
export function startPlatformTimer(onTimeout: () => void, ms: number): () => void {
  const timer = setTimeout(onTimeout, ms);

  return () => {
    clearTimeout(timer);
  };
}
