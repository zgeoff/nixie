import { promptIDs } from '@heynixie/prompts';
import { z } from 'zod';

const storedOverrideSchema = z.object({
  parts: z.record(z.string(), z.string()),
  template: z.string().nullable(),
});

export const storedPromptsSchema = z.looseObject({
  prompts: z.partialRecord(z.enum(promptIDs), storedOverrideSchema).default({}),
});
