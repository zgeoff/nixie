import invariant from 'tiny-invariant';
import { promptRegistry } from './prompt-registry';
import type { PromptID } from './types';

export function collectAcceptedPaths(id: PromptID, part: string | null): readonly string[] {
  const entry = promptRegistry[id];
  const partNames = Object.keys(entry.parts);

  if (part === null) {
    return [...entry.paths, ...partNames.map((name) => `parts.${name}`)];
  }

  const index = partNames.indexOf(part);

  invariant(index !== -1, `the ${id} prompt has no part ${part}`);

  return [...entry.paths, ...partNames.slice(0, index).map((name) => `parts.${name}`)];
}
