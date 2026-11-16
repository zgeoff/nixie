import { z } from 'zod';

const fieldSchema = z.enum(['toolCall.input', 'toolCall.content', 'worker.text', 'worker.detail']);

// a key of an object, or an index of an array
const pathStepSchema = z.union([z.string(), z.number()]);

export const clippedPayloadSchema = z.object({
  field: fieldSchema,

  // where the cut string sits inside the field; empty when the field is left out
  path: z.array(pathStepSchema),

  // the UTF-8 size of the whole value at the path
  bytes: z.number(),
});
