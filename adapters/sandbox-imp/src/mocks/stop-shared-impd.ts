let stopHeld: (() => Promise<void>) | null = null;

export function registerSharedImpdStop(stop: () => Promise<void>): void {
  stopHeld = stop;
}

export async function stopSharedImpd(): Promise<void> {
  const stop = stopHeld;

  stopHeld = null;

  await stop?.();
}
