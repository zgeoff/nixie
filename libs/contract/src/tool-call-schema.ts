import { z } from 'zod';

const jsonObjectSchema = z.record(z.string(), z.unknown());

// A tool call's record and its result's record share the call ID. The call carries the tool and
// its input, and the result its outcome and content, while they are readable.
export const toolCallSchema = z.object({
  callID: z.string(),
  content: jsonObjectSchema.optional(),
  input: jsonObjectSchema.optional(),
  outcome: z.string().optional(),
  tool: z.string().optional(),
});
