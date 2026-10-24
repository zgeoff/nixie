import { promptRegistry } from './prompt-registry';
import type { PromptID } from './types';

export function getPromptParts(id: PromptID): readonly string[] {
  return Object.keys(promptRegistry[id].parts);
}
