import { z } from 'zod';

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const toolCallSchema = z.object({
  callID: z.string(),
  content: jsonObjectSchema.optional(),
  input: jsonObjectSchema.optional(),
  outcome: z.string().optional(),
  tool: z.string().optional(),
});
