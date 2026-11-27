import { getPromptParts, promptIDs } from '@heynixie/prompts';
import { z } from 'zod';

// The prompts of the memory tasks nixie no longer has. A manifest may still name them, and the seed
// drops each one, whatever it holds.
export const retiredPromptIDs = ['writer', 'consolidator'] as const;

export const manifestPromptsSchema = z.strictObject({
  ...Object.fromEntries(retiredPromptIDs.map((id) => [id, z.unknown().optional()])),
  ...Object.fromEntries(
    promptIDs.map((id) => [
      id,
      z
        .strictObject({
          _template: z.string().optional(),
          ...Object.fromEntries(getPromptParts(id).map((part) => [part, z.string().optional()])),
        })
        .optional(),
    ]),
  ),
});
