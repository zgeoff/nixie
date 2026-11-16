import { z } from 'zod';

export const destinationPatternSchema = z
  .string()
  .regex(/^\S+$/u, 'a pattern holds no spaces')
  .describe('Exact text, or a pattern whose only wildcard is *, which matches any run of text');
