import { z } from 'zod';

export const memoryRefsSchema = z
  .object({ itemID: z.string(), version: z.int().positive() })
  .array();
