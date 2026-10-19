import type { DefinitionsInForce } from '@heynixie/definitions';
import type { SeedParts } from './run-definitions-seed';
import { runDefinitionsSeed } from './run-definitions-seed';
import type { InForce } from './types';

// Takes a fresh snapshot for a skill reload, seeds it when its revision is new, and returns the
// definitions then in force. A refused snapshot leaves the last good seed in force. Before the
// server's parts start, no seed runs, and the definitions in force stay as they are.
export async function refreshDefinitions(
  parts: SeedParts | null,
  inForce: InForce,
): Promise<DefinitionsInForce | null> {
  if (parts !== null) {
    await runDefinitionsSeed(parts);
  }

  return inForce.read();
}
