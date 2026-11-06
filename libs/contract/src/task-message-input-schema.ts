import { z } from 'zod';
import { taskMessageKindSchema } from './task-message-kind-schema';

export const taskMessageInputSchema = z.object({
  to: z.string(),
  kind: taskMessageKindSchema,
  body: z.string(),
  replyTo: z.string().optional(),
  onBehalfOf: z.string().array().optional(),
  wake: z.boolean().optional(),
});
