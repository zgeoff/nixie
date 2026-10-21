import type { DefinitionsInForce } from '@heynixie/definitions';
import { runDefinitionsSeed } from './run-definitions-seed';
import type { SeedParts } from './run-queued-seed';
import type { InForce } from './types';

export async function refreshDefinitions(
  parts: SeedParts | null,
  inForce: InForce,
): Promise<DefinitionsInForce | null> {
  if (parts !== null) {
    await runDefinitionsSeed(parts);
  }

  return inForce.read();
}
