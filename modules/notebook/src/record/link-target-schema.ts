import { z } from 'zod';

export const linkTargetSchema = z.union([
  z.strictObject({ note: z.string() }),
  z.strictObject({ memory: z.string() }),
  z.strictObject({ moment: z.string() }),
  z.strictObject({ event: z.string() }),
]);

export const linkTypeSchema = z.enum(['supersedes', 'disputes', 'part-of', 'cites', 'related']);
