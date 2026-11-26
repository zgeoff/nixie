import { z } from 'zod';

const maxTextChars = 1_000_000;

// The arguments of each Drive tool that queues, as the queue stores them.
export const driveArgumentsSchema = {
  create: z.strictObject({
    name: z.string().min(1).max(255),
    text: z.string().max(maxTextChars),
    as: z.enum(['google_doc', 'text']),
    connection: z.string().exactOptional(),
  }),

  // `name` renames the file, and null leaves it. `text` replaces the whole content.
  change: z.strictObject({
    file: z.string(),
    name: z.string().min(1).max(255).nullable().exactOptional(),
    text: z.string().max(maxTextChars),
    connection: z.string().exactOptional(),
  }),
};
