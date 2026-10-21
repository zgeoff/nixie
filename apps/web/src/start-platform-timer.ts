export type StartTimer = (onTimeout: () => void, delayMs: number) => () => void;

export function startPlatformTimer(onTimeout: () => void, delayMs: number): () => void {
  const timer = setTimeout(onTimeout, delayMs);

  return () => {
    clearTimeout(timer);
  };
}
