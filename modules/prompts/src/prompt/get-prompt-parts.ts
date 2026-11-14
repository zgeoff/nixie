import type { PromptID } from '../types';
import { promptRegistry } from './prompt-registry';

export function getPromptParts(id: PromptID): readonly string[] {
  return Object.keys(promptRegistry[id].parts);
}
