import { z } from 'zod';

// The item versions a record names, such as those a turn retrieved.
export const memoryRefsSchema = z
  .object({ itemID: z.string(), version: z.int().positive() })
  .array();
