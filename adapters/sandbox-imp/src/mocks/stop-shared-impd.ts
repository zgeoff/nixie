const stopsHeld: (() => Promise<void>)[] = [];

export function registerSharedImpdStop(stop: () => Promise<void>): void {
  stopsHeld.push(stop);
}

// Each stop restores the WebSocket class that was global when its impd started, so the stops run
// in the reverse of the order that the impds started.
export async function stopSharedImpd(): Promise<void> {
  const stops = stopsHeld.splice(0).toReversed();

  for (const stop of stops) {
    await stop();
  }
}
