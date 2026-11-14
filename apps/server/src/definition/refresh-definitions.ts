import type { DefinitionsInForce } from '@heynixie/definitions';
import type { SeedParts } from '../seed/run-queued-seed';
import type { InForce } from '../types';
import { runDefinitionsSeed } from './run-definitions-seed';

export async function refreshDefinitions(
  parts: SeedParts | null,
  inForce: InForce,
): Promise<DefinitionsInForce | null> {
  if (parts !== null) {
    await runDefinitionsSeed(parts);
  }

  return inForce.read();
}
