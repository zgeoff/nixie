import { getPromptParts, promptIDs } from '@heynixie/prompts';
import { z } from 'zod';

export const manifestPromptsSchema = z.strictObject(
  Object.fromEntries(
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
);
