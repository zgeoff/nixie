import { onTestFinished } from 'bun:test';
import type { SpawnedNixie, SpawnedNixieOptions } from './create-spawned-nixie';
import { createSpawnedNixie } from './create-spawned-nixie';

export type { RecoveredState, SpawnedNixie, SpawnedNixieOptions } from './create-spawned-nixie';

export function startSpawnedNixie(options: SpawnedNixieOptions = {}): Promise<SpawnedNixie> {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  return createSpawnedNixie(stack, options);
}
